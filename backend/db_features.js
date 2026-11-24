const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('./config');

const db = new sqlite3.Database(DB_PATH);

function initFeatureTables() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS feed_posts (
      id TEXT PRIMARY KEY, author_id TEXT, author_name TEXT, content TEXT,
      likes INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS feed_comments (
      id TEXT PRIMARY KEY, post_id TEXT, author_name TEXT, content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS hub_articles (
      id TEXT PRIMARY KEY, title TEXT, category TEXT, description TEXT, content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS funding_projects (
      id TEXT PRIMARY KEY, title TEXT, description TEXT, goal REAL, raised REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY, title TEXT, description TEXT, options TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // Gamification
    db.run(`CREATE TABLE IF NOT EXISTS citizen_points (
      citizen_id TEXT PRIMARY KEY, name TEXT, points INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0, last_action DATE, badge TEXT DEFAULT 'Newcomer',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // Community
    db.run(`CREATE TABLE IF NOT EXISTS volunteers (
      id TEXT PRIMARY KEY, citizen_id TEXT, name TEXT, phone TEXT, skill TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS petitions (
      id TEXT PRIMARY KEY, title TEXT, description TEXT, target INTEGER DEFAULT 100,
      created_by TEXT, created_by_name TEXT,
      signatures TEXT DEFAULT '[]', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  });
}

initFeatureTables();

// --- Feed ---
function getFeedPosts() {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM feed_posts ORDER BY created_at DESC`, (err, rows) => resolve(rows || []));
  });
}
function getCommentsForPost(post_id) {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM feed_comments WHERE post_id = ? ORDER BY created_at ASC`, [post_id], (err, rows) => resolve(rows || []));
  });
}
function addFeedPost(post) {
  return new Promise((resolve) => {
    const id = `POST-${Date.now()}`;
    db.run(`INSERT INTO feed_posts (id, author_id, author_name, content) VALUES (?, ?, ?, ?)`,
      [id, post.author_id, post.author_name, post.content], () => resolve({ id, ...post, likes: 0 }));
  });
}
function addFeedComment(comment) {
  return new Promise((resolve) => {
    const id = `COM-${Date.now()}`;
    db.run(`INSERT INTO feed_comments (id, post_id, author_name, content) VALUES (?, ?, ?, ?)`,
      [id, comment.post_id, comment.author_name, comment.content], () => resolve({ id, ...comment }));
  });
}
function likePost(post_id) {
  return new Promise((resolve) => {
    db.run(`UPDATE feed_posts SET likes = likes + 1 WHERE id = ?`, [post_id], () => resolve(true));
  });
}

// --- Hub ---
function getHubArticles() {
  return new Promise((resolve) => db.all(`SELECT * FROM hub_articles ORDER BY created_at DESC`, (err, rows) => resolve(rows || [])));
}
function addHubArticle(article) {
  return new Promise((resolve) => {
    const id = `ART-${Date.now()}`;
    db.run(`INSERT INTO hub_articles (id, title, category, description, content) VALUES (?, ?, ?, ?, ?)`,
      [id, article.title, article.category, article.description, article.content], () => resolve({ id, ...article }));
  });
}

// --- Funding ---
function getFundingProjects() {
  return new Promise((resolve) => db.all(`SELECT * FROM funding_projects ORDER BY created_at DESC`, (err, rows) => resolve(rows || [])));
}
function addFundingProject(project) {
  return new Promise((resolve) => {
    const id = `FUND-${Date.now()}`;
    db.run(`INSERT INTO funding_projects (id, title, description, goal) VALUES (?, ?, ?, ?)`,
      [id, project.title, project.description, project.goal], () => resolve({ id, ...project, raised: 0 }));
  });
}
function contributeFunding(id, amount) {
  return new Promise((resolve) => {
    db.run(`UPDATE funding_projects SET raised = raised + ? WHERE id = ?`, [amount, id], () => resolve(true));
  });
}

// --- Polls ---
function getPolls() {
  return new Promise((resolve) => db.all(`SELECT * FROM polls ORDER BY created_at DESC`, (err, rows) => {
    if (!rows) return resolve([]);
    resolve(rows.map(r => ({ ...r, options: JSON.parse(r.options) })));
  }));
}
function addPoll(poll) {
  return new Promise((resolve) => {
    const id = `POLL-${Date.now()}`;
    db.run(`INSERT INTO polls (id, title, description, options) VALUES (?, ?, ?, ?)`,
      [id, poll.title, poll.description, JSON.stringify(poll.options)], () => resolve({ id, ...poll }));
  });
}
function votePoll(id, optionIndex) {
  return new Promise((resolve) => {
    db.get(`SELECT options FROM polls WHERE id = ?`, [id], (err, row) => {
      if (!row) return resolve(false);
      const options = JSON.parse(row.options);
      if (options[optionIndex]) options[optionIndex].votes++;
      db.run(`UPDATE polls SET options = ? WHERE id = ?`, [JSON.stringify(options), id], () => resolve(true));
    });
  });
}

// --- Gamification ---
function BADGE(pts) {
  if (pts >= 500) return '🏆 City Champion';
  if (pts >= 200) return '🦸 Civic Hero';
  if (pts >= 100) return '⭐ Active Citizen';
  if (pts >= 30)  return '🌱 Rising Star';
  return '🆕 Newcomer';
}

function awardPoints(citizen_id, name, pts) {
  return new Promise((resolve) => {
    const today = new Date().toISOString().slice(0, 10);
    db.get(`SELECT * FROM citizen_points WHERE citizen_id = ?`, [citizen_id], (err, row) => {
      if (!row) {
        const badge = BADGE(pts);
        db.run(`INSERT INTO citizen_points (citizen_id, name, points, streak, last_action, badge) VALUES (?,?,?,1,?,?)`,
          [citizen_id, name, pts, today, badge], () => resolve(true));
      } else {
        const streak = row.last_action === today ? row.streak : row.streak + 1;
        const newPts = row.points + pts;
        const badge = BADGE(newPts);
        db.run(`UPDATE citizen_points SET points=?, streak=?, last_action=?, badge=?, name=? WHERE citizen_id=?`,
          [newPts, streak, today, badge, name, citizen_id], () => resolve(true));
      }
    });
  });
}

function getLeaderboard() {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM citizen_points ORDER BY points DESC LIMIT 20`, (err, rows) => resolve(rows || []));
  });
}

function getCitizenStats(citizen_id) {
  return new Promise((resolve) => {
    db.get(`SELECT * FROM citizen_points WHERE citizen_id = ?`, [citizen_id], (err, row) => resolve(row || null));
  });
}

// --- Volunteers ---
function registerVolunteer(v) {
  return new Promise((resolve) => {
    const id = `VOL-${Date.now()}`;
    db.run(`INSERT INTO volunteers (id, citizen_id, name, phone, skill) VALUES (?,?,?,?,?)`,
      [id, v.citizen_id, v.name, v.phone, v.skill], () => resolve({ id, ...v }));
  });
}
function getVolunteers() {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM volunteers ORDER BY created_at DESC`, (err, rows) => resolve(rows || []));
  });
}

// --- Petitions ---
function getPetitions() {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM petitions ORDER BY created_at DESC`, (err, rows) => {
      resolve((rows || []).map(r => ({ ...r, signatures: JSON.parse(r.signatures) })));
    });
  });
}
function addPetition(p) {
  return new Promise((resolve) => {
    const id = `PET-${Date.now()}`;
    db.run(`INSERT INTO petitions (id, title, description, target, created_by, created_by_name) VALUES (?,?,?,?,?,?)`,
      [id, p.title, p.description, p.target || 100, p.created_by, p.created_by_name], () => resolve({ id, ...p, signatures: [] }));
  });
}
function signPetition(id, citizen_id) {
  return new Promise((resolve) => {
    db.get(`SELECT signatures FROM petitions WHERE id = ?`, [id], (err, row) => {
      if (!row) return resolve({ error: 'Not found' });
      const sigs = JSON.parse(row.signatures);
      if (sigs.includes(citizen_id)) return resolve({ error: 'Already signed' });
      sigs.push(citizen_id);
      db.run(`UPDATE petitions SET signatures = ? WHERE id = ?`, [JSON.stringify(sigs), id], () => resolve({ count: sigs.length }));
    });
  });
}

module.exports = {
  getFeedPosts, getCommentsForPost, addFeedPost, addFeedComment, likePost,
  getHubArticles, addHubArticle,
  getFundingProjects, addFundingProject, contributeFunding,
  getPolls, addPoll, votePoll,
  awardPoints, getLeaderboard, getCitizenStats,
  registerVolunteer, getVolunteers,
  getPetitions, addPetition, signPetition
};
