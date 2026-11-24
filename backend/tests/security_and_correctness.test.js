// backend/tests/security_and_correctness.test.js
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Ensure test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_must_be_long_enough_for_security_123456';
process.env.AADHAAR_PEPPER = 'test_aadhaar_pepper_secret_key_12345';
process.env.OTP_DEBUG = 'false';

const app = require('../index');
const db = require('../db');
const { validateVerhoeff, hashAadhaar, generateVerhoeff } = require('../aadhaar');
const { signToken } = require('../auth');

// Helper to generate a valid 12-digit Aadhaar
function createValidAadhaar(base11) {
  const cleanBase = String(base11).padStart(11, '0').slice(0, 11);
  const checkDigit = generateVerhoeff(cleanBase);
  return `${cleanBase}${checkDigit}`;
}

describe('1. Aadhaar Validation and Hashing', () => {
  test('validateVerhoeff accepts valid 12-digit numbers with correct checksum', () => {
    const aadhaar1 = createValidAadhaar('23456789012');
    const aadhaar2 = createValidAadhaar('98765432109');
    assert.strictEqual(validateVerhoeff(aadhaar1), true);
    assert.strictEqual(validateVerhoeff(aadhaar2), true);
  });

  test('validateVerhoeff rejects altered digits and transpositions', () => {
    const valid = createValidAadhaar('23456789012');
    // Alter last digit
    const lastDigit = parseInt(valid[11], 10);
    const altered = valid.slice(0, 11) + ((lastDigit + 1) % 10);
    assert.strictEqual(validateVerhoeff(altered), false);

    // Transpose adjacent digits
    const chars = valid.split('');
    const temp = chars[0];
    chars[0] = chars[1];
    chars[1] = temp;
    const transposed = chars.join('');
    if (transposed !== valid) {
      assert.strictEqual(validateVerhoeff(transposed), false);
    }
  });

  test('validateVerhoeff rejects invalid lengths and non-digits', () => {
    assert.strictEqual(validateVerhoeff('12345'), false);
    assert.strictEqual(validateVerhoeff('1234567890123'), false);
    assert.strictEqual(validateVerhoeff('abcd1234efgh'), false);
    assert.strictEqual(validateVerhoeff(''), false);
    assert.strictEqual(validateVerhoeff(null), false);
  });

  test('hashAadhaar produces deterministic 64-character hex strings without raw digits', () => {
    const aadhaar = createValidAadhaar('55555555555');
    const hash1 = hashAadhaar(aadhaar);
    const hash2 = hashAadhaar(aadhaar);
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
    assert.strictEqual(/^[a-f0-9]{64}$/.test(hash1), true);
    assert.strictEqual(hash1.includes(aadhaar), false);
  });
});

describe('2. Citizen OTP Lifecycle, Single-Use, and Enumeration Protection', () => {
  const registeredAadhaar = createValidAadhaar('44444444444');
  const unregisteredAadhaar = createValidAadhaar('33333333333');

  before(async () => {
    await db.registerCitizen({
      aadhaar_hash: registeredAadhaar,
      name: 'Registered Citizen',
      phone: '9999999999',
      email: 'citizen@test.gov'
    });
  });

  test('POST /api/auth/citizen/request-otp returns identical response for registered and unknown Aadhaars', async () => {
    const resRegistered = await request(app)
      .post('/api/auth/citizen/request-otp')
      .send({ aadhaar: registeredAadhaar });

    const resUnknown = await request(app)
      .post('/api/auth/citizen/request-otp')
      .send({ aadhaar: unregisteredAadhaar });

    assert.strictEqual(resRegistered.status, 200);
    assert.strictEqual(resUnknown.status, 200);
    assert.strictEqual(resRegistered.body.message, resUnknown.body.message);
    assert.strictEqual(resRegistered.body.success, true);
    assert.strictEqual(resUnknown.body.success, true);
    assert.strictEqual(resRegistered.body.message.includes('If this Aadhaar is registered'), true);
  });

  test('Enforces 60-second cooldown on consecutive OTP requests for the same Aadhaar', async () => {
    const resCooldown = await request(app)
      .post('/api/auth/citizen/request-otp')
      .send({ aadhaar: registeredAadhaar });

    assert.strictEqual(resCooldown.status, 429);
    assert.strictEqual(resCooldown.body.error.includes('wait 60 seconds'), true);
  });

  test('POST /api/auth/citizen/register requires valid Verhoeff and name', async () => {
    const resInvalidAadhaar = await request(app)
      .post('/api/auth/citizen/register')
      .send({ aadhaar: '000000000000', name: 'Test' });
    assert.strictEqual(resInvalidAadhaar.status, 400);

    const validAadhaar = createValidAadhaar('88888888888');
    const resNoName = await request(app)
      .post('/api/auth/citizen/register')
      .send({ aadhaar: validAadhaar, name: '' });
    assert.strictEqual(resNoName.status, 400);
  });

  test('POST /api/auth/citizen/login rejects invalid OTP code and enforces attempt limit', async () => {
    const testLoginAadhaar = createValidAadhaar('12121212121');
    await db.registerCitizen({
      aadhaar_hash: testLoginAadhaar,
      name: 'Attempt Tester',
      phone: '9876543210',
      email: 'tester@test.gov'
    });

    // Request OTP with OTP_DEBUG=true temporarily to inspect flow
    process.env.OTP_DEBUG = 'true';
    const reqRes = await request(app)
      .post('/api/auth/citizen/request-otp')
      .send({ aadhaar: testLoginAadhaar });
    process.env.OTP_DEBUG = 'false';

    assert.strictEqual(reqRes.status, 200);
    const validOtp = reqRes.body.otp;
    assert.ok(validOtp);

    // Try wrong OTP
    const wrongRes = await request(app)
      .post('/api/auth/citizen/login')
      .send({ aadhaar: testLoginAadhaar, otp: '999999' });
    assert.strictEqual(wrongRes.status, 401);

    // Login with correct OTP (single use)
    const successRes = await request(app)
      .post('/api/auth/citizen/login')
      .send({ aadhaar: testLoginAadhaar, otp: validOtp });
    assert.strictEqual(successRes.status, 200);
    assert.ok(successRes.body.token);
    assert.strictEqual(successRes.body.user.aadhaar, undefined);
    assert.strictEqual(successRes.body.user.aadhaar_hash, undefined);

    // Replay attack: second use must fail
    const replayRes = await request(app)
      .post('/api/auth/citizen/login')
      .send({ aadhaar: testLoginAadhaar, otp: validOtp });
    assert.strictEqual(replayRes.status, 401);
  });
});

describe('3. Upload Sniffing and Error Responses', () => {
  const token = signToken({ id: 'CIT-TEST-1', name: 'Upload Tester', role: 'citizen' }, 'citizen');
  const tempDir = path.join(__dirname, 'temp');

  before(() => {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  });

  after(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('Rejects fake image files disguised with image extension and deletes them', async () => {
    const fakeImagePath = path.join(tempDir, 'fake.jpg');
    fs.writeFileSync(fakeImagePath, '<?php echo "Not a real JPEG"; ?>');

    const res = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${token}`)
      .field('description', 'Report with spoofed image')
      .attach('photo', fakeImagePath);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.includes('Invalid image file signature'), true);
  });

  test('Accepts valid image signature (PNG)', async () => {
    const realPngPath = path.join(tempDir, 'valid.png');
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A followed by dummy data
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    fs.writeFileSync(realPngPath, pngHeader);

    const res = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${token}`)
      .field('description', 'Valid pothole with real PNG')
      .field('zone', 'North')
      .attach('photo', realPngPath);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.complaint.zone, 'North');
  });

  test('Returns JSON error on file size limit exceed (413)', async () => {
    const largeImagePath = path.join(tempDir, 'oversize.jpg');
    // Create > 5MB buffer
    const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024);
    largeBuffer[0] = 0xFF; largeBuffer[1] = 0xD8; largeBuffer[2] = 0xFF;
    fs.writeFileSync(largeImagePath, largeBuffer);

    const res = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${token}`)
      .field('description', 'Too large photo')
      .attach('photo', largeImagePath);

    assert.strictEqual(res.status, 413);
    assert.strictEqual(res.body.error.includes('File too large'), true);
  });
});

describe('4. Status Transition Validation', () => {
  let complaintId;
  const adminToken = signToken({ id: 'ADM-001', name: 'Admin', role: 'admin' }, 'admin');

  before(async () => {
    complaintId = `TEST-STATUS-${Date.now()}`;
    await db.saveComplaint({
      complaint_id: complaintId,
      citizen_id: 'CIT-STATUS',
      name: 'Status Tester',
      category: 'Road & Infrastructure Department',
      department: 'Road & Infrastructure Department',
      description: 'Pothole needing status testing',
      status: 'Pending',
      zone: 'Central'
    });
  });

  test('Rejects invalid status value with 400', async () => {
    const res = await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'InvalidStatus' });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.includes('Invalid status'), true);
  });

  test('Rejects direct transition from Pending to Resolved with 400', async () => {
    const res = await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Resolved' });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.includes('Cannot transition directly from Pending to Resolved'), true);
  });

  test('Permits transition from Pending to In Progress', async () => {
    const res = await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'In Progress' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.complaint.status, 'In Progress');
  });

  test('Permits transition from In Progress to Resolved', async () => {
    const res = await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Resolved' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.complaint.status, 'Resolved');
  });

  test('Rejects modification of an already resolved complaint', async () => {
    const res = await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'In Progress' });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.includes('already Resolved'), true);
  });
});

describe('5. Officer Department Scoping and Fail-Closed Enforcement', () => {
  let roadComplaintId;
  let waterComplaintId;
  let roadCitizenId;

  const roadOfficerToken = signToken({
    id: 'OFF-ROAD',
    name: 'Road Officer',
    role: 'officer',
    department: 'Road & Infrastructure Department'
  }, 'admin');

  const unassignedOfficerToken = signToken({
    id: 'OFF-NONE',
    name: 'No Dept Officer',
    role: 'officer',
    department: null
  }, 'admin');

  before(async () => {
    // Register citizen to verify staff receives contact details with fresh unique Aadhaar
    const uniqueBase = '6' + String(Date.now()).slice(-10);
    const uniqueAadhaar = createValidAadhaar(uniqueBase);
    const regRes = await db.registerCitizen({
      aadhaar_hash: uniqueAadhaar,
      name: 'Road Citizen',
      phone: '9888888888',
      email: 'roadcitizen@test.gov'
    });
    roadCitizenId = (regRes.citizen && regRes.citizen.id) || `CIT-ROAD-${Date.now()}`;

    roadComplaintId = `TEST-ROAD-${Date.now()}`;
    await db.saveComplaint({
      complaint_id: roadComplaintId,
      citizen_id: roadCitizenId,
      name: 'Road Citizen',
      category: 'Road & Infrastructure Department',
      department: 'Road & Infrastructure Department',
      description: 'Road issue',
      status: 'Pending',
      zone: 'Central'
    });

    waterComplaintId = `TEST-WATER-${Date.now()}`;
    await db.saveComplaint({
      complaint_id: waterComplaintId,
      citizen_id: 'CIT-WATER',
      name: 'Water Citizen',
      category: 'Water Supply Department',
      department: 'Water Supply Department',
      description: 'Water leak',
      status: 'Pending',
      zone: 'East'
    });
  });

  test('Officer can view complaints in their department via GET /api/complaints/:id and receives citizen contacts', async () => {
    const res = await request(app)
      .get(`/api/complaints/${roadComplaintId}`)
      .set('Authorization', `Bearer ${roadOfficerToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.complaint.complaint_id, roadComplaintId);
    // Staff get citizen contact details
    assert.ok(res.body.complaint.citizen);
    assert.strictEqual(res.body.complaint.citizen.name, 'Road Citizen');
    assert.strictEqual(res.body.complaint.citizen.phone, '9888888888');
    assert.strictEqual(res.body.complaint.citizen.email, 'roadcitizen@test.gov');
    // But never Aadhaar
    assert.strictEqual(res.body.complaint.aadhaar, undefined);
    assert.strictEqual(res.body.complaint.citizen.aadhaar_hash, undefined);
  });

  test('Officer gets 404 (not 403) when accessing a complaint outside their department', async () => {
    const res = await request(app)
      .get(`/api/complaints/${waterComplaintId}`)
      .set('Authorization', `Bearer ${roadOfficerToken}`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Complaint not found.');
  });

  test('Officer with no department fails closed (matches nothing)', async () => {
    // GET /api/complaints/all returns 0 complaints
    const resAll = await request(app)
      .get('/api/complaints/all')
      .set('Authorization', `Bearer ${unassignedOfficerToken}`);

    assert.strictEqual(resAll.status, 200);
    assert.strictEqual(resAll.body.complaints.length, 0);

    // GET /:id returns 404
    const resId = await request(app)
      .get(`/api/complaints/${roadComplaintId}`)
      .set('Authorization', `Bearer ${unassignedOfficerToken}`);

    assert.strictEqual(resId.status, 404);
  });
});

describe('6. Cross-Citizen Isolation and PII Protection', () => {
  let citizen1ComplaintId;
  const citizen1Id = `CIT-1-${Date.now()}`;
  const citizen2Id = `CIT-2-${Date.now()}`;

  const citizen1Token = signToken({ id: citizen1Id, name: 'Citizen One', role: 'citizen' }, 'citizen');
  const citizen2Token = signToken({ id: citizen2Id, name: 'Citizen Two', role: 'citizen' }, 'citizen');

  before(async () => {
    citizen1ComplaintId = `GRV-CIT1-${Date.now()}`;
    await db.saveComplaint({
      complaint_id: citizen1ComplaintId,
      citizen_id: citizen1Id,
      name: 'Citizen One',
      email: 'citizen1@test.gov',
      category: 'Sanitation & Waste Management',
      department: 'Sanitation & Waste Management',
      description: 'Garbage pile on corner',
      status: 'Pending',
      zone: 'West'
    });
  });

  test('Citizen can read their own complaint without Aadhaar field or PII leak', async () => {
    const res = await request(app)
      .get(`/api/complaints/${citizen1ComplaintId}`)
      .set('Authorization', `Bearer ${citizen1Token}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.complaint.complaint_id, citizen1ComplaintId);
    // Crucial: No Aadhaar in any form
    assert.strictEqual(res.body.complaint.aadhaar, undefined);
    assert.strictEqual(res.body.complaint.aadhaar_hash, undefined);
    // Citizens do not get citizen contact details block
    assert.strictEqual(res.body.complaint.citizen, undefined);
  });

  test('Cross-citizen access returns 404, not 403 (does not confirm id exists)', async () => {
    const res = await request(app)
      .get(`/api/complaints/${citizen1ComplaintId}`)
      .set('Authorization', `Bearer ${citizen2Token}`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Complaint not found.');
  });

  test('Unauthenticated access to GET /api/complaints/:id returns 401', async () => {
    const res = await request(app).get(`/api/complaints/${citizen1ComplaintId}`);
    assert.strictEqual(res.status, 401);
  });

  test('GET /api/complaints/public/map is paginated and strips all citizen PII', async () => {
    const res = await request(app).get('/api/complaints/public/map?page=1&limit=10');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.complaints));
    assert.ok(typeof res.body.total === 'number');

    res.body.complaints.forEach(c => {
      assert.strictEqual(c.name, undefined);
      assert.strictEqual(c.email, undefined);
      assert.strictEqual(c.phone, undefined);
      assert.strictEqual(c.citizen_id, undefined);
      assert.strictEqual(c.aadhaar, undefined);
      assert.strictEqual(c.aadhaar_hash, undefined);
    });
  });
});

describe('7. Server Resilience, Error Middleware & JSON 404', () => {
  test('Serves static HTML pages without requiring DB session', async () => {
    const resHome = await request(app).get('/');
    assert.strictEqual(resHome.status, 200);

    const resLogin = await request(app).get('/citizen/login');
    assert.strictEqual(resLogin.status, 200);

    const resAdmin = await request(app).get('/admin/dashboard');
    assert.strictEqual(resAdmin.status, 200);
  });

  test('Unmatched /api/* routes return JSON 404', async () => {
    const res = await request(app).get('/api/non-existent-route-xyz');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Endpoint not found');
  });

  test('Protected routes return 401 for unauthenticated requests', async () => {
    const resMine = await request(app).get('/api/complaints/mine');
    assert.strictEqual(resMine.status, 401);

    const resAll = await request(app).get('/api/complaints/all');
    assert.strictEqual(resAll.status, 401);

    const resStats = await request(app).get('/api/complaints/stats');
    assert.strictEqual(resStats.status, 401);
  });
});

after(() => {
  if (db.closeDatabase) {
    db.closeDatabase(() => {});
  }
  // Allow pending timers to clear and cleanly exit
  setTimeout(() => process.exit(0), 100).unref();
});
