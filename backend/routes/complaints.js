// server/routes/complaints.js - V2: Photo upload, Geotagging, Scoping and Auth
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const db = require('../db');
const { requireCitizen, requireAdmin, requireSession, departmentScope } = require('../auth');
const { complaintLimiter } = require('../rate_limits');
const { classifyComplaint } = require('../classifier');
const { sendDepartmentNotification, sendCitizenConfirmation } = require('../mailer');

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only images (JPEG, PNG, WEBP) are allowed.'));
  }
});

// Middleware for Multer file uploads with JSON error response (413 on oversize)
function handlePhotoUpload(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large. Maximum size is 5MB.' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

/**
 * Verify real image magic numbers/signatures (JPEG, PNG, WEBP)
 */
function verifyImageSignature(filePath) {
  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);
    if (bytesRead < 12) return false;

    // JPEG: FF D8 FF
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
                  buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
    // WEBP: RIFF....WEBP
    const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';

    return isJpeg || isPng || isWebp;
  } catch {
    return false;
  }
}

// Concurrency queue for generating Python charts serially
let chartQueue = Promise.resolve();

function generateChartsSerial(stats) {
  return new Promise((resolve, reject) => {
    chartQueue = chartQueue.then(() => new Promise((done) => {
      const pythonBin = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
      const scriptPath = path.join(__dirname, '..', 'generate_charts.py');
      const child = execFile(pythonBin, [scriptPath], (error, stdout, stderr) => {
        done();
        if (error) return reject(error);
        resolve({ stdout, stderr });
      });
      child.stdin.write(JSON.stringify(stats));
      child.stdin.end();
    })).catch((err) => {
      chartQueue = Promise.resolve();
      reject(err);
    });
  });
}

// ─── Citizen Submission ──────────────────────────────────────────────────────

// POST /api/complaints - Submit with photo, optional geotag, and zone
router.post('/', requireCitizen, complaintLimiter, handlePhotoUpload, async (req, res) => {
  try {
    const { description, location, lat, lng, is_emergency, zone } = req.body;
    const citizen_id = req.user.id;
    const citizen_name = req.user.name;

    if (!description || !description.trim()) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(400).json({ error: 'Description is required.' });
    }

    // Verify real image signature if photo was provided
    if (req.file) {
      if (!verifyImageSignature(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(400).json({ error: 'Invalid image file signature. Only real JPEG, PNG, or WEBP images are allowed.' });
      }
    }

    // AI Classification fallback
    const classification = classifyComplaint(description);
    const chosenCategory = (req.body.category || req.body.department || '').trim();
    const finalCategory = chosenCategory || classification.category;
    const finalDepartment = chosenCategory || classification.department;
    const finalDeptEmail = chosenCategory ? (chosenCategory.toLowerCase().replace(/[^a-z0-9]/g, '') + '@citygov.in') : classification.departmentEmail;

    // Geotag extraction from photo if available
    let finalLat = lat ? parseFloat(lat) : null;
    let finalLng = lng ? parseFloat(lng) : null;
    let photoUrl = null;

    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
      try {
        const gps = await exifr.gps(req.file.path);
        if (gps && gps.latitude && gps.longitude) {
          finalLat = gps.latitude;
          finalLng = gps.longitude;
          console.log(`📍 Extracted GPS from EXIF: ${finalLat}, ${finalLng}`);
        }
      } catch (err) {
        console.log('No GPS EXIF data found in photo.');
      }
    }

    // Priority auto-scoring
    const urgentKeywords = ['fire', 'flood', 'accident', 'danger', 'emergency', 'death', 'injury', 'critical'];
    const isUrgent = urgentKeywords.some(k => description.toLowerCase().includes(k));
    let priority = isUrgent ? 'High' : 'Normal';
    if (is_emergency === 'true' || is_emergency === true) {
      priority = 'Emergency';
    }

    // Generate ID
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const shortId = uuidv4().split('-')[0].toUpperCase();
    const complaint_id = `GRV-${dateStr}-${shortId}`;

    // Duplicate Detection Logic
    const duplicate = await db.findDuplicateComplaints(classification.category, finalLat, finalLng);

    const complaint = {
      complaint_id,
      citizen_id,
      name: citizen_name,
      email: req.user.email || '',
      description: description.trim(),
      location: location || '',
      category: finalCategory,
      department: finalDepartment,
      departmentEmail: finalDeptEmail,
      status: 'Pending',
      priority,
      lat: finalLat,
      lng: finalLng,
      photo_url: photoUrl,
      zone: zone || 'Central',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      timeline: [{ from: null, to: 'Pending', changed_by: 'citizen', at: now.toISOString() }],
      parent_id: duplicate ? duplicate.complaint_id : null
    };

    // Save
    await db.saveComplaint(complaint);

    // Award points for filing a complaint (20 pts)
    try {
      const dbF = require('../db_features');
      await dbF.awardPoints(citizen_id, citizen_name, 20);
    } catch (e) {}

    // Send emails (async)
    const citizen = await db.findCitizenById(citizen_id);
    if (citizen && citizen.email) {
      sendCitizenConfirmation({ ...complaint, email: citizen.email });
    }
    sendDepartmentNotification(complaint);

    res.status(201).json({ success: true, complaint });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Literal Routes (MUST BE DECLARED BEFORE /:id) ───────────────────────────

// GET /api/complaints/mine - My history
router.get('/mine', requireCitizen, async (req, res) => {
  const complaints = await db.getComplaintsByCitizenId(req.user.id);
  res.json({ success: true, complaints });
});

// GET /api/complaints/all - Admin and officer list with department scoping and pagination
router.get('/all', requireAdmin, async (req, res) => {
  const { status, category, priority, assigned_to, zone, startDate, endDate } = req.query;
  const filters = { status, category, priority, assigned_to, zone, startDate, endDate };

  const scope = departmentScope(req.user);
  if (scope) {
    filters.department = scope;
  } else if (req.query.department) {
    filters.department = req.query.department;
  }

  const allComplaints = await db.getAllComplaints(filters);
  const total = allComplaints.length;

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit) || 100));
  const paginated = allComplaints.slice((page - 1) * limit, page * limit);

  res.json({
    success: true,
    complaints: paginated,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  });
});

// GET /api/complaints/geotagged - Geotagged complaints scoped by department
router.get('/geotagged', requireAdmin, async (req, res) => {
  const scope = departmentScope(req.user);
  const complaints = await db.getGeotaggedComplaints(scope);
  res.json({ success: true, complaints });
});

// GET /api/complaints/stats - Analytics statistics scoped by department
router.get('/stats', requireAdmin, async (req, res) => {
  const { month, year } = req.query;
  const scope = departmentScope(req.user);

  const stats = await db.getStats(
    scope,
    month !== undefined ? parseInt(month) : null,
    year !== undefined ? parseInt(year) : null
  );
  res.json({ success: true, stats });
});

// GET /api/complaints/python-stats - Python Matplotlib charts scoped by department
router.get('/python-stats', requireAdmin, async (req, res) => {
  const { month, year } = req.query;
  const scope = departmentScope(req.user);

  const stats = await db.getStats(
    scope,
    month !== undefined ? parseInt(month) : null,
    year !== undefined ? parseInt(year) : null
  );

  try {
    await generateChartsSerial(stats);
    res.json({
      success: true,
      stats,
      charts: {
        volume: `/uploads/charts/volume.png?t=${Date.now()}`,
        status: `/uploads/charts/status.png?t=${Date.now()}`,
        dept: `/uploads/charts/dept.png?t=${Date.now()}`,
        zone: `/uploads/charts/zone.png?t=${Date.now()}`
      }
    });
  } catch (error) {
    console.error(`Python chart generation error (falling back): ${error.message}`);
    res.json({ success: true, stats });
  }
});

// GET /api/complaints/public/map - Public map data stripped of PII and paginated
router.get('/public/map', async (req, res) => {
  const allPublic = await db.getPublicComplaints();
  const total = allPublic.length;

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit) || 100));
  const paginated = allPublic.slice((page - 1) * limit, page * limit);

  // Strictly strip any citizen PII (name, email, phone, citizen_id)
  const sanitized = paginated.map(c => ({
    complaint_id: c.complaint_id,
    category: c.category,
    status: c.status,
    lat: c.lat,
    lng: c.lng,
    description: c.description,
    photo_url: c.photo_url || null,
    support_count: c.support_count || 0,
    created_at: c.created_at
  }));

  res.json({
    success: true,
    complaints: sanitized,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  });
});

// POST /api/complaints/check-nearby - Check for nearby duplicates before submission
router.post('/check-nearby', requireCitizen, async (req, res) => {
  let { category, description, lat, lng } = req.body;
  if (!category && description) {
    category = classifyComplaint(description).category;
  }
  const duplicate = await db.findDuplicateComplaints(category, parseFloat(lat), parseFloat(lng));
  res.json({ success: true, duplicate });
});

// GET /api/complaints/public/track/:id - Public complaint tracking without citizen PII
router.get('/public/track/:id', async (req, res) => {
  const complaint = await db.getComplaintById(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found with that ID.' });

  res.json({
    success: true,
    complaint: {
      complaint_id: complaint.complaint_id,
      category: complaint.category,
      department: complaint.department,
      status: complaint.status,
      description: complaint.description,
      location: complaint.location,
      lat: complaint.lat,
      lng: complaint.lng,
      photo_url: complaint.photo_url || null,
      created_at: complaint.created_at,
      timeline: complaint.timeline || []
    }
  });
});

// ─── Parameterized Routes ────────────────────────────────────────────────────

// GET /api/complaints/:id - Require session; citizens see only own, officers only own dept (404 on mismatch)
router.get('/:id', requireSession, async (req, res) => {
  const complaint = await db.getComplaintWithCitizen(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

  if (req.user.role === 'citizen') {
    if (complaint.citizen_id !== req.user.id) {
      return res.status(404).json({ error: 'Complaint not found.' });
    }
    // Citizens do not get citizen contact details
    delete complaint.citizen;
    delete complaint.email;
    delete complaint.phone;
  } else if (req.user.role === 'officer') {
    const scope = departmentScope(req.user);
    if (scope === '__FAIL_CLOSED__' || complaint.department !== scope) {
      return res.status(404).json({ error: 'Complaint not found.' });
    }
    // Staff get citizen contact details
  } else if (req.user.role === 'admin' || req.user.role === 'superadmin') {
    // Admins get citizen contact details
  } else {
    return res.status(404).json({ error: 'Complaint not found.' });
  }

  // Ensure no Aadhaar in any form
  delete complaint.aadhaar;
  delete complaint.aadhaar_hash;
  if (complaint.citizen) {
    delete complaint.citizen.aadhaar;
    delete complaint.citizen.aadhaar_hash;
  }

  res.json({ success: true, complaint });
});

// PATCH /api/complaints/:id/assign - Admin or department officer assigns complaint
router.patch('/:id/assign', requireAdmin, async (req, res) => {
  const { assigned_to, deadline } = req.body;
  if (!assigned_to || assigned_to.trim() === '' || assigned_to === 'Unassigned') {
    return res.status(400).json({ error: 'Please select an officer from the list to assign.' });
  }

  const complaint = await db.getComplaintById(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

  const scope = departmentScope(req.user);
  if (scope && (scope === '__FAIL_CLOSED__' || complaint.department !== scope)) {
    return res.status(404).json({ error: 'Complaint not found.' });
  }

  const actor = req.user.name || req.user.email || req.user.role || 'Officer';
  const newStatus = complaint.status === 'Pending' ? 'In Progress' : complaint.status;

  const updated = await db.assignComplaint(complaint.complaint_id, assigned_to.trim(), deadline || null, actor, newStatus);
  if (!updated) {
    return res.status(500).json({ error: 'Failed to update assignment in database.' });
  }

  res.json({ success: true, complaint: updated });
});

// PATCH /api/complaints/:id/status - Update status with strict transition validation
router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['Pending', 'In Progress', 'Resolved', 'Rejected'];

  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status '${status}'. Must be one of: ${allowedStatuses.join(', ')}.`
    });
  }

  const complaint = await db.getComplaintById(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

  const scope = departmentScope(req.user);
  if (scope && (scope === '__FAIL_CLOSED__' || complaint.department !== scope)) {
    return res.status(404).json({ error: 'Complaint not found.' });
  }

  // Enforce status transitions
  const currentStatus = complaint.status;
  if (currentStatus === 'Pending' && status === 'Resolved') {
    return res.status(400).json({
      error: 'Invalid transition: Cannot transition directly from Pending to Resolved. Status must be In Progress first.'
    });
  }

  if (currentStatus === 'Resolved' || currentStatus === 'Rejected') {
    return res.status(400).json({
      error: `Cannot update a grievance that is already ${currentStatus}.`
    });
  }

  const updated = await db.updateComplaintStatus(req.params.id, status, req.user.name);
  if (!updated) return res.status(404).json({ error: 'Complaint not found.' });

  // Real-time notification
  const citizen = await db.findCitizenById(updated.citizen_id);
  if (citizen && citizen.email) {
    const { sendStatusUpdateEmail } = require('../mailer');
    sendStatusUpdateEmail({ ...updated, email: citizen.email }, status);
  }

  res.json({ success: true, complaint: updated });
});

// POST /api/complaints/:id/feedback - Citizens rate service
router.post('/:id/feedback', requireCitizen, async (req, res) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Valid rating (1-5) is required.' });
  }

  const complaint = await db.getComplaintById(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });
  if (complaint.citizen_id !== req.user.id) {
    return res.status(404).json({ error: 'Complaint not found.' });
  }
  if (complaint.status !== 'Resolved') {
    return res.status(400).json({ error: 'Feedback can only be provided for resolved complaints.' });
  }

  const updated = await db.addComplaintFeedback(req.params.id, { rating, comment });
  res.json({ success: true, complaint: updated });
});

// POST /api/complaints/:id/support - Support an existing complaint
router.post('/:id/support', requireCitizen, async (req, res) => {
  const result = await db.supportComplaint(req.params.id, req.user.id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ success: true, count: result.count });
});

module.exports = router;
