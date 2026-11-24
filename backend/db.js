// backend/db.js - SQLite Implementation (Local File-based)
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { hashAadhaar } = require('./aadhaar');

const { DB_PATH } = require('./config');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('SQLite Connection Error:', err.message);
  } else {
    console.log('Connected to Local SQLite Database.');
  }
});

// Queue the schema now, not inside the open callback: a query issued before the
// connection finished opening used to run ahead of CREATE TABLE and fail with
// "no such table". sqlite3 executes queued statements in order, so this is safe.
initTables();

// ─── Initialization ──────────────────────────────────────────────────────────

function initTables() {
  db.serialize(() => {
    // Citizens Table
    db.run(`CREATE TABLE IF NOT EXISTS citizens (
      id TEXT PRIMARY KEY,
      aadhaar_hash TEXT UNIQUE,
      name TEXT,
      phone TEXT,
      email TEXT,
      photo_url TEXT,
      verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Ensure verified column exists for existing tables
    db.run(`ALTER TABLE citizens ADD COLUMN verified INTEGER DEFAULT 0`, () => {});

    // Admins Table
    db.run(`CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      name TEXT,
      role TEXT DEFAULT 'admin',
      department TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Complaints Table
    db.run(`CREATE TABLE IF NOT EXISTS complaints (
      complaint_id TEXT PRIMARY KEY,
      citizen_id TEXT,
      name TEXT,
      email TEXT,
      category TEXT,
      description TEXT,
      status TEXT DEFAULT 'Pending',
      priority TEXT DEFAULT 'Normal',
      department TEXT DEFAULT 'General',
      departmentEmail TEXT,
      lat REAL,
      lng REAL,
      location TEXT,
      location_text TEXT,
      photo_url TEXT,
      support_count INTEGER DEFAULT 0,
      supports TEXT, -- JSON string array
      timeline TEXT, -- JSON string array
      parent_id TEXT,
      assigned_to TEXT DEFAULT 'Unassigned',
      deadline DATETIME,
      escalated BOOLEAN DEFAULT 0,
      zone TEXT DEFAULT 'Central',
      rating INTEGER,
      feedback_comment TEXT,
      feedback_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    seedAdmins();
  });
}

function getConnectionStatus() {
  return 1; // Always connected for SQLite once opened
}

// ─── Citizens ────────────────────────────────────────────────────────────────

function registerCitizen({ aadhaar_hash, name, phone, email, verified = 1 }) {
  return new Promise((resolve, reject) => {
    const id = `CIT-${Date.now()}`;
    const cleanHash = /^[a-f0-9]{64}$/i.test(aadhaar_hash) ? aadhaar_hash : hashAadhaar(aadhaar_hash);
    const sql = `INSERT INTO citizens (id, aadhaar_hash, name, phone, email, verified) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [id, cleanHash, name, phone || '', email || '', verified ? 1 : 0], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          if (process.env.NODE_ENV !== 'production') {
            // In testing/dev mode: update existing citizen record so tester is not blocked by duplicate Aadhaar
            db.run(
              `UPDATE citizens SET name = ?, phone = ?, email = ?, verified = ? WHERE aadhaar_hash = ?`,
              [name, phone || '', email || '', verified ? 1 : 0, cleanHash],
              function(uErr) {
                if (uErr) return resolve({ error: 'Database error occurred during update.' });
                db.get(`SELECT id, name, phone, email FROM citizens WHERE aadhaar_hash = ?`, [cleanHash], (sErr, row) => {
                  if (sErr || !row) return resolve({ citizen: { id, name, phone, email } });
                  resolve({ citizen: row });
                });
              }
            );
            return;
          }
          return resolve({ error: 'Aadhaar already registered.' });
        }
        console.error('Register Citizen Error:', err);
        return resolve({ error: 'Database error occurred.' });
      }
      resolve({ citizen: { id, name, phone, email } });
    });
  });
}

function findCitizenByAadhaar(aadhaar) {
  return new Promise((resolve) => {
    const hashed = /^[a-f0-9]{64}$/i.test(aadhaar) ? aadhaar : hashAadhaar(aadhaar);
    db.get(`SELECT * FROM citizens WHERE aadhaar_hash = ? OR aadhaar_hash = ?`, [hashed, aadhaar], (err, row) => {
      resolve(row || null);
    });
  });
}

function findCitizenById(id) {
  return new Promise((resolve) => {
    db.get(`SELECT * FROM citizens WHERE id = ?`, [id], (err, row) => {
      resolve(row || null);
    });
  });
}

// ─── Admins ──────────────────────────────────────────────────────────────────

async function seedAdmins() {
  db.get(`SELECT COUNT(*) as count FROM admins`, async (err, row) => {
    if (row && row.count > 0) return;

    const admins = [
      { id: 'ADM-001', email: 'admin@fixmycity.gov', name: 'Super Admin', role: 'admin', department: 'All' },
      { id: 'OFF-001', email: 'road@municipality.gov', name: 'Road Dept Officer', role: 'officer', department: 'Road & Infrastructure Department' },
      { id: 'OFF-002', email: 'water@municipality.gov', name: 'Water Dept Officer', role: 'officer', department: 'Water Supply Department' },
      { id: 'OFF-003', email: 'electric@municipality.gov', name: 'Electric Dept Officer', role: 'officer', department: 'Electricity Department' },
      { id: 'OFF-004', email: 'sanitation@municipality.gov', name: 'Sanitation Officer', role: 'officer', department: 'Sanitation & Waste Management' },
      { id: 'OFF-005', email: 'health@municipality.gov', name: 'Health Dept Officer', role: 'officer', department: 'Public Health Department' },
      { id: 'OFF-006', email: 'transport@municipality.gov', name: 'Transport Officer', role: 'officer', department: 'Transport Department' },
      { id: 'OFF-007', email: 'municipal@municipality.gov', name: 'General Services Officer', role: 'officer', department: 'Municipal Services' }
    ];

    for (const adminData of admins) {
      const hash = await bcrypt.hash('Fix@1234', 10);
      db.run(`INSERT OR IGNORE INTO admins (id, email, password_hash, name, role, department) VALUES (?, ?, ?, ?, ?, ?)`,
        [adminData.id, adminData.email, hash, adminData.name, adminData.role, adminData.department]);
    }
    console.log('✅ Local Admin and 7 Officers seeded successfully.');
  });
}

function findAdminByEmail(email) {
  return new Promise((resolve) => {
    db.get(`SELECT * FROM admins WHERE email = ? COLLATE NOCASE`, [email], (err, row) => {
      resolve(row || null);
    });
  });
}

// ─── Complaints ───────────────────────────────────────────────────────────────

function saveComplaint(c) {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO complaints (
      complaint_id, citizen_id, name, email, category, description, status, priority,
      department, departmentEmail, lat, lng, location, location_text, photo_url,
      support_count, supports, timeline, parent_id, assigned_to, deadline, escalated, zone
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const deadline = c.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const params = [
      c.complaint_id, c.citizen_id, c.name, c.email, c.category, c.description, c.status || 'Pending', c.priority || 'Normal',
      c.department, c.departmentEmail, c.lat, c.lng, c.location, c.location_text, c.photo_url,
      c.support_count || 0, JSON.stringify(c.supports || []), JSON.stringify(c.timeline || []),
      c.parent_id, c.assigned_to || 'Unassigned', deadline, c.escalated ? 1 : 0, c.zone || 'Central'
    ];

    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ ...c, id: this.lastID });
    });
  });
}

function getAllComplaints(filters = {}) {
  return new Promise((resolve) => {
    let sql = `SELECT * FROM complaints WHERE 1=1`;
    const params = [];

    if (filters.status) { sql += ` AND status = ?`; params.push(filters.status); }
    if (filters.category) {
      sql += ` AND (category = ? OR department = ? OR category LIKE ? OR department LIKE ?)`;
      params.push(filters.category, filters.category, `%${filters.category}%`, `%${filters.category}%`);
    }
    if (filters.priority) { sql += ` AND priority = ?`; params.push(filters.priority); }
    if (filters.assigned_to) { sql += ` AND assigned_to = ?`; params.push(filters.assigned_to); }
    if (filters.zone) { sql += ` AND zone = ?`; params.push(filters.zone); }
    if (filters.department) { sql += ` AND department = ?`; params.push(filters.department); }
    if (filters.escalated !== undefined) { sql += ` AND escalated = ?`; params.push(filters.escalated ? 1 : 0); }

    if (filters.startDate) { sql += ` AND created_at >= ?`; params.push(filters.startDate); }
    if (filters.endDate) { sql += ` AND created_at <= ?`; params.push(filters.endDate); }

    sql += ` ORDER BY created_at DESC`;

    db.all(sql, params, (err, rows) => {
      resolve(rows.map(processComplaintRow));
    });
  });
}

function processComplaintRow(row) {
  if (!row) return null;
  return {
    ...row,
    supports: row.supports ? JSON.parse(row.supports) : [],
    timeline: row.timeline ? JSON.parse(row.timeline) : [],
    escalated: !!row.escalated
  };
}

function getComplaintById(complaint_id) {
  return new Promise((resolve) => {
    db.get(`SELECT * FROM complaints WHERE complaint_id = ? OR rowid = ?`, [complaint_id, complaint_id], (err, row) => {
      if (err) {
        // Fallback to complaint_id alone if rowid lookup fails
        db.get(`SELECT * FROM complaints WHERE complaint_id = ?`, [complaint_id], (err2, row2) => {
          resolve(processComplaintRow(row2));
        });
        return;
      }
      resolve(processComplaintRow(row));
    });
  });
}

async function getComplaintWithCitizen(complaint_id) {
  const complaint = await getComplaintById(complaint_id);
  if (!complaint) return null;

  const citizen = await findCitizenById(complaint.citizen_id);
  const data = { ...complaint };
  return {
    ...data,
    email: data.email || (citizen ? citizen.email : 'N/A'),
    citizen: citizen ? {
      id: citizen.id,
      name: citizen.name,
      email: citizen.email,
      phone: citizen.phone,
      photo_url: citizen.photo_url
    } : null
  };
}

function getComplaintsByCitizenId(citizen_id) {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM complaints WHERE citizen_id = ? ORDER BY created_at DESC`, [citizen_id], (err, rows) => {
      resolve(rows.map(processComplaintRow));
    });
  });
}

async function updateComplaintStatus(complaint_id, status, changed_by = 'admin') {
  const complaint = await getComplaintById(complaint_id);
  if (!complaint) return null;

  const prev = complaint.status;
  const timeline = [...complaint.timeline];
  timeline.push({
    from: prev,
    to: status,
    changed_by,
    at: new Date().toISOString()
  });

  return new Promise((resolve) => {
    db.run(`UPDATE complaints SET status = ?, timeline = ?, updated_at = CURRENT_TIMESTAMP WHERE complaint_id = ? OR rowid = ?`,
      [status, JSON.stringify(timeline), complaint_id, complaint_id], function(err) {
        if (err) return resolve(null);
        getComplaintById(complaint_id).then(resolve);
      });
  });
}

function assignComplaint(complaint_id, staff_name, deadline, actor = 'Super Admin', newStatus = null) {
  return new Promise((resolve) => {
    getComplaintById(complaint_id).then(complaint => {
      if (!complaint) return resolve(null);
      
      const timeline = Array.isArray(complaint.timeline) ? complaint.timeline : [];
      const updatedStatus = newStatus || (complaint.status === 'Pending' ? 'In Progress' : complaint.status);
      
      timeline.push({
        from: complaint.status,
        to: updatedStatus,
        changed_by: actor,
        at: new Date().toISOString(),
        note: `Assigned to ${staff_name}${deadline ? ` (Deadline: ${deadline})` : ''}`
      });

      db.run(`UPDATE complaints SET assigned_to = ?, deadline = ?, status = ?, timeline = ?, updated_at = CURRENT_TIMESTAMP WHERE complaint_id = ? OR rowid = ?`,
        [staff_name, deadline, updatedStatus, JSON.stringify(timeline), complaint_id, complaint_id], function(err) {
          if (err) {
            console.error('[DB] assignComplaint error:', err);
            return resolve(null);
          }
          getComplaintById(complaint_id).then(resolve);
        });
    });
  });
}

function getGeotaggedComplaints(department = null) {
  return new Promise((resolve) => {
    if (department === '__FAIL_CLOSED__') return resolve([]);
    let sql = `SELECT * FROM complaints WHERE lat IS NOT NULL AND lng IS NOT NULL`;
    const params = [];
    if (department) {
      sql += ` AND department = ?`;
      params.push(department);
    }
    db.all(sql, params, (err, rows) => {
      resolve(rows ? rows.map(processComplaintRow) : []);
    });
  });
}

function addComplaintFeedback(complaint_id, feedback) {
  return new Promise((resolve) => {
    db.run(`UPDATE complaints SET rating = ?, feedback_comment = ?, feedback_at = CURRENT_TIMESTAMP WHERE complaint_id = ?`,
      [feedback.rating, feedback.comment || '', complaint_id], function(err) {
        if (err) return resolve(null);
        getComplaintById(complaint_id).then(resolve);
      });
  });
}

async function findDuplicateComplaints(category, lat, lng, radiusKm = 0.5) {
  if (!lat || !lng) return null;
  const filters = category ? { category } : {};
  const complaints = await getAllComplaints(filters);
  
  return complaints.find(c => {
    if (!c.lat || !c.lng) return false;
    if (['Resolved', 'Rejected'].includes(c.status)) return false;

    const R = 6371;
    const dLat = (c.lat - lat) * Math.PI / 180;
    const dLng = (c.lng - lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat * Math.PI / 180) * Math.cos(c.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return distance <= radiusKm;
  });
}

async function supportComplaint(complaint_id, citizen_id) {
  const complaint = await getComplaintById(complaint_id);
  if (!complaint) return { error: 'Complaint not found.' };

  const supports = [...complaint.supports];
  if (supports.includes(citizen_id)) return { error: 'You have already supported this.' };

  supports.push(citizen_id);
  const count = supports.length;

  return new Promise((resolve) => {
    db.run(`UPDATE complaints SET supports = ?, support_count = ? WHERE complaint_id = ?`,
      [JSON.stringify(supports), count, complaint_id], function(err) {
        if (err) return resolve({ error: 'Update failed' });
        resolve({ success: true, count });
      });
  });
}

async function getPublicComplaints() {
  const complaints = await getAllComplaints();
  return complaints.map(c => ({
    complaint_id: c.complaint_id,
    category: c.category,
    status: c.status,
    lat: c.lat,
    lng: c.lng,
    description: c.description,
    support_count: c.support_count || 0,
    created_at: c.created_at
  }));
}

async function getStats(department = null, month = null, year = null) {
  if (department === '__FAIL_CLOSED__') {
    return {
      total: 0,
      totalCitizens: 0,
      byCategory: {},
      byStatus: { Pending: 0, 'In Progress': 0, Resolved: 0, Rejected: 0 },
      byDepartment: {},
      byPriority: { High: 0, Normal: 0 },
      byZone: { North: 0, South: 0, East: 0, West: 0, Central: 0 },
      timeSeries: {},
      avgResolutionDays: 0
    };
  }
  const complaints = await getAllComplaints(department ? { department } : {});
  const citizens = await new Promise(resolve => {
    db.get(`SELECT COUNT(*) as count FROM citizens`, (err, row) => resolve(row ? row.count : 0));
  });

  const byCategory = {};
  const byStatus = { Pending: 0, 'In Progress': 0, Resolved: 0, Rejected: 0 };
  const byDepartment = {};
  const byPriority = { High: 0, Normal: 0 };
  const byZone = { North: 0, South: 0, East: 0, West: 0, Central: 0 };
  
  const timeSeries = {};
  
  let totalResolutionTime = 0;
  let resolvedCount = 0;
  let totalCount = 0;

  complaints.forEach(c => {
    if (!c.created_at) return;
    
    // Parse date for filtering
    const date = new Date(c.created_at);
    if (year !== null && year !== undefined && date.getFullYear() !== year) return;
    if (month !== null && month !== undefined && date.getMonth() !== month) return;

    totalCount++;

    const cat = c.category || 'General';
    byCategory[cat] = (byCategory[cat] || 0) + 1;

    if (byStatus[c.status] !== undefined) {
      byStatus[c.status]++;
    } else {
      byStatus[c.status] = 1;
    }

    const dept = c.department || 'General';
    byDepartment[dept] = (byDepartment[dept] || 0) + 1;

    const zone = c.zone || 'Central';
    byZone[zone] = (byZone[zone] || 0) + 1;

    const pKey = c.priority === 'High' ? 'High' : 'Normal';
    byPriority[pKey]++;

    if (c.status === 'Resolved' && c.created_at && c.updated_at) {
      const start = new Date(c.created_at);
      const end = new Date(c.updated_at);
      totalResolutionTime += (end - start);
      resolvedCount++;
    }

    // Populate daily timeSeries formatted as YYYY-MM-DD
    const datePart = c.created_at.substring(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      timeSeries[datePart] = (timeSeries[datePart] || 0) + 1;
    }
  });

  return {
    total: totalCount,
    totalCitizens: citizens,
    byCategory,
    byStatus,
    byDepartment,
    byPriority,
    byZone,
    timeSeries,
    avgResolutionDays: resolvedCount > 0 ? (totalResolutionTime / resolvedCount / (1000 * 60 * 60 * 24)).toFixed(1) : 0
  };
}

async function escalateComplaints() {
  return new Promise((resolve) => {
    db.run(`UPDATE complaints SET escalated = 1 WHERE status NOT IN ('Resolved', 'Rejected') AND escalated = 0 AND deadline < CURRENT_TIMESTAMP`, [], function(err) {
      if (this && this.changes > 0) console.log(`[SYSTEM] Escalated ${this.changes} overdue complaints.`);
      resolve(this ? this.changes : 0);
    });
  });
}

function closeDatabase(cb) {
  if (db) {
    db.close(cb);
  } else if (cb) {
    cb();
  }
}

module.exports = {
  getConnectionStatus,
  seedAdmins,
  escalateComplaints,
  closeDatabase,
  registerCitizen, findCitizenByAadhaar, findCitizenById,
  findAdminByEmail,
  saveComplaint, getAllComplaints, getComplaintById, getComplaintWithCitizen,
  getComplaintsByCitizenId, updateComplaintStatus, assignComplaint,
  getGeotaggedComplaints, getStats,
  addComplaintFeedback, findDuplicateComplaints,
  supportComplaint, getPublicComplaints
};
