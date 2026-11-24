const express = require('express');
const router = express.Router();
const dbF = require('../db_features');
const db = require('../db');
const { requireCitizen, requireAdmin } = require('../auth');

// ─── Sentiment analysis helper ───────────────────────────────────────────────
function analyzeSentiment(text) {
  const angry = ['terrible','horrible','disgusting','worst','useless','pathetic','incompetent','shame','outrage','furious','unacceptable'];
  const urgent = ['emergency','danger','critical','urgent','fire','flood','death','injury','collapse','gas leak'];
  const t = text.toLowerCase();
  const angryScore = angry.filter(w => t.includes(w)).length;
  const urgentScore = urgent.filter(w => t.includes(w)).length;
  if (urgentScore >= 1) return { label: 'URGENT', color: '#ef4444', priority: 'Emergency' };
  if (angryScore >= 2)  return { label: 'FRUSTRATED', color: '#f97316', priority: 'High' };
  if (angryScore === 1) return { label: 'CONCERNED', color: '#eab308', priority: 'Normal' };
  return { label: 'NEUTRAL', color: '#10b981', priority: 'Normal' };
}

// ─── Feed ────────────────────────────────────────────────────────────────────
router.get('/feed', requireCitizen, async (req, res) => {
  const posts = await dbF.getFeedPosts();
  for (let p of posts) p.comments = await dbF.getCommentsForPost(p.id);
  res.json({ success: true, posts });
});
router.post('/feed', requireCitizen, async (req, res) => {
  const post = await dbF.addFeedPost({ author_id: req.user.id, author_name: req.user.name, content: req.body.content });
  await dbF.awardPoints(req.user.id, req.user.name, 5);
  res.json({ success: true, post });
});
router.post('/feed/:id/comment', requireCitizen, async (req, res) => {
  const comment = await dbF.addFeedComment({ post_id: req.params.id, author_name: req.user.name, content: req.body.content });
  await dbF.awardPoints(req.user.id, req.user.name, 2);
  res.json({ success: true, comment });
});
router.post('/feed/:id/like', requireCitizen, async (req, res) => {
  await dbF.likePost(req.params.id);
  res.json({ success: true });
});

// ─── Hub ─────────────────────────────────────────────────────────────────────
router.get('/hub', requireCitizen, async (req, res) => {
  const articles = await dbF.getHubArticles();
  res.json({ success: true, articles });
});
router.post('/hub', requireAdmin, async (req, res) => {
  const article = await dbF.addHubArticle(req.body);
  res.json({ success: true, article });
});

// ─── Funding ─────────────────────────────────────────────────────────────────
router.get('/funding', requireCitizen, async (req, res) => {
  const projects = await dbF.getFundingProjects();
  res.json({ success: true, projects });
});
router.post('/funding', requireAdmin, async (req, res) => {
  const project = await dbF.addFundingProject(req.body);
  res.json({ success: true, project });
});
router.post('/funding/:id/contribute', requireCitizen, async (req, res) => {
  await dbF.contributeFunding(req.params.id, req.body.amount);
  await dbF.awardPoints(req.user.id, req.user.name, 10);
  res.json({ success: true });
});

// ─── Polls ───────────────────────────────────────────────────────────────────
router.get('/polls', requireCitizen, async (req, res) => {
  const polls = await dbF.getPolls();
  res.json({ success: true, polls });
});
router.post('/polls', requireAdmin, async (req, res) => {
  const poll = await dbF.addPoll(req.body);
  res.json({ success: true, poll });
});
router.post('/polls/:id/vote', requireCitizen, async (req, res) => {
  await dbF.votePoll(req.params.id, req.body.optionIndex);
  await dbF.awardPoints(req.user.id, req.user.name, 5);
  res.json({ success: true });
});

// ─── Gamification ────────────────────────────────────────────────────────────
router.get('/leaderboard', async (req, res) => {
  const board = await dbF.getLeaderboard();
  res.json({ success: true, board });
});
router.get('/my-stats', requireCitizen, async (req, res) => {
  const stats = await dbF.getCitizenStats(req.user.id);
  res.json({ success: true, stats });
});

// ─── Sentiment (public endpoint for portal) ──────────────────────────────────
router.post('/sentiment', requireCitizen, (req, res) => {
  const result = analyzeSentiment(req.body.text || '');
  res.json({ success: true, ...result });
});

// ─── Community: Volunteers ───────────────────────────────────────────────────
router.get('/volunteers', requireAdmin, async (req, res) => {
  const list = await dbF.getVolunteers();
  res.json({ success: true, volunteers: list });
});
router.post('/volunteer', requireCitizen, async (req, res) => {
  const v = await dbF.registerVolunteer({ citizen_id: req.user.id, name: req.user.name, phone: req.body.phone, skill: req.body.skill });
  await dbF.awardPoints(req.user.id, req.user.name, 20);
  res.json({ success: true, volunteer: v });
});

// ─── Community: Petitions ────────────────────────────────────────────────────
router.get('/petitions', requireCitizen, async (req, res) => {
  const petitions = await dbF.getPetitions();
  res.json({ success: true, petitions });
});
router.post('/petitions', requireCitizen, async (req, res) => {
  const p = await dbF.addPetition({ ...req.body, created_by: req.user.id, created_by_name: req.user.name });
  await dbF.awardPoints(req.user.id, req.user.name, 15);
  res.json({ success: true, petition: p });
});
router.post('/petitions/:id/sign', requireCitizen, async (req, res) => {
  const result = await dbF.signPetition(req.params.id, req.user.id);
  if (result.error) return res.status(400).json({ error: result.error });
  await dbF.awardPoints(req.user.id, req.user.name, 5);
  res.json({ success: true, ...result });
});

// ─── Analytics: Public Transparency ─────────────────────────────────────────
router.get('/transparency', async (req, res) => {
  const stats = await db.getStats();
  const projects = await dbF.getFundingProjects();
  res.json({ success: true, stats, projects });
});

// ─── Analytics: Dept Scorecards ──────────────────────────────────────────────
router.get('/scorecards', requireAdmin, async (req, res) => {
  const complaints = await db.getAllComplaints();
  const depts = {};
  complaints.forEach(c => {
    const d = c.department || 'General';
    if (!depts[d]) depts[d] = { total: 0, resolved: 0, totalTime: 0, ratings: [] };
    depts[d].total++;
    if (c.status === 'Resolved') {
      depts[d].resolved++;
      if (c.created_at && c.updated_at) {
        depts[d].totalTime += (new Date(c.updated_at) - new Date(c.created_at));
      }
    }
    if (c.rating) depts[d].ratings.push(c.rating);
  });

  const scorecards = Object.entries(depts).map(([name, d]) => {
    const resRate = d.total > 0 ? Math.round((d.resolved / d.total) * 100) : 0;
    const avgTime = d.resolved > 0 ? (d.totalTime / d.resolved / 86400000).toFixed(1) : 'N/A';
    const avgRating = d.ratings.length > 0 ? (d.ratings.reduce((a, b) => a + b, 0) / d.ratings.length).toFixed(1) : 'N/A';
    const grade = resRate >= 90 ? 'A' : resRate >= 75 ? 'B' : resRate >= 60 ? 'C' : resRate >= 40 ? 'D' : 'F';
    return { name, total: d.total, resolved: d.resolved, resRate, avgTime, avgRating, grade };
  });

  res.json({ success: true, scorecards });
});

// ─── SLA Status (for admin) ──────────────────────────────────────────────────
router.get('/sla-breaches', requireAdmin, async (req, res) => {
  const all = await db.getAllComplaints();
  const breaches = all.filter(c => {
    if (['Resolved', 'Rejected'].includes(c.status)) return false;
    return c.deadline && new Date(c.deadline) < new Date();
  });
  res.json({ success: true, breaches, count: breaches.length });
});

// ─── Auto-report ─────────────────────────────────────────────────────────────
router.get('/auto-report', requireAdmin, async (req, res) => {
  const stats = await db.getStats();
  const slaRes = await db.getAllComplaints();
  const breaches = slaRes.filter(c => !['Resolved','Rejected'].includes(c.status) && c.deadline && new Date(c.deadline) < new Date());
  const report = {
    generatedAt: new Date().toISOString(),
    summary: stats,
    slaBreaches: breaches.length,
    topIssue: Object.entries(stats.byCategory).sort((a,b) => b[1]-a[1])[0] || ['None', 0],
    worstDept: Object.entries(stats.byDepartment).sort((a,b) => b[1]-a[1])[0] || ['None', 0],
  };
  res.json({ success: true, report });
});

module.exports = router;

