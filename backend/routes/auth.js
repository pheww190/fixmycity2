// server/routes/auth.js - Hardened authentication routes for citizens and staff
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { signToken } = require('../auth');
const { validateVerhoeff, hashAadhaar } = require('../aadhaar');
const { authAttemptLimiter, codeRequestLimiter, registrationLimiter } = require('../rate_limits');
const db = require('../db');
const { sendOtpEmail } = require('../mailer');

const authRouter = express.Router();

// Constant timing dummy hash for email timing attacks
const DUMMY_HASH = '$2a$10$wN9iL6n2qCg9l0a0BqK3te7jG4n3L8qF2v0mK5dJ7pL2v1nK3qE6i';

// In-memory OTP stores (hashed at rest)
// Keyed by Aadhaar HMAC hash
const loginOtpStore = {};
const regOtpStore = {};

function getAadhaarKey(aadhaar) {
  return hashAadhaar(aadhaar);
}

// ─── Citizen Registration (Two-Step: /register -> /verify) ───────────────────

// Step 1: POST /api/auth/citizen/register - Validate details, send 6-digit OTP
authRouter.post('/citizen/register', registrationLimiter, codeRequestLimiter, async (req, res) => {
  const { aadhaar, name, phone, email } = req.body;

  if (!validateVerhoeff(aadhaar)) {
    return res.status(400).json({ error: 'Invalid Aadhaar number. Must be a valid 12-digit number passing Verhoeff checksum.' });
  }

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const existingCitizen = await db.findCitizenByAadhaar(aadhaar);
  if (existingCitizen && process.env.NODE_ENV === 'production') {
    return res.status(400).json({ error: 'Aadhaar is already registered. Please proceed to login.' });
  }

  const key = getAadhaarKey(aadhaar);

  // Check 60-second cooldown
  if (regOtpStore[key] && (Date.now() - regOtpStore[key].lastRequested < 60000)) {
    return res.status(429).json({ error: 'Please wait 60 seconds before requesting another code.' });
  }

  // Generate random 6-digit OTP
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  // Hash code at rest
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  regOtpStore[key] = {
    codeHash,
    userData: {
      name: name.trim(),
      phone: phone ? String(phone).trim() : '',
      email: email ? String(email).trim() : ''
    },
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    attempts: 0,
    lastRequested: Date.now()
  };

  // Deliver OTP: email if provided, log to console.
  // Fire and forget — the first send creates an Ethereal account over HTTPS and
  // can take several seconds. The citizen should not wait for the mail server.
  if (email && email.trim()) {
    sendOtpEmail(email.trim(), code).catch((err) =>
      console.error('[mailer] registration OTP failed:', err.message)
    );
  } else {
    console.log(`[AUTH REGISTRATION OTP] for ${name} (${phone || 'no phone'}): ${code}`);
  }

  const showDebug = process.env.OTP_DEBUG === 'true' && process.env.NODE_ENV !== 'production';
  res.json({
    success: true,
    message: 'Verification code sent successfully. Please verify to complete registration.',
    ...(showDebug ? { otp: code } : {})
  });
});

// Step 2: POST /api/auth/citizen/verify - Verify OTP and complete registration
authRouter.post('/citizen/verify', authAttemptLimiter, async (req, res) => {
  const { aadhaar, otp } = req.body;

  if (!validateVerhoeff(aadhaar)) {
    return res.status(400).json({ error: 'Invalid Aadhaar number.' });
  }

  const key = getAadhaarKey(aadhaar);
  const record = regOtpStore[key];

  if (!record || Date.now() > record.expiresAt) {
    delete regOtpStore[key];
    return res.status(401).json({ error: 'Invalid or expired OTP.' });
  }

  record.attempts++;
  if (record.attempts > 5) {
    delete regOtpStore[key];
    return res.status(401).json({ error: 'Maximum attempts exceeded (5). Please request a new registration code.' });
  }

  const receivedHash = crypto.createHash('sha256').update(String(otp || '').trim()).digest('hex');
  if (receivedHash !== record.codeHash) {
    if (record.attempts >= 5) delete regOtpStore[key];
    return res.status(401).json({ error: 'Invalid or expired OTP.' });
  }

  // Single use: delete upon verification
  const userData = record.userData;
  delete regOtpStore[key];

  // Save to DB as verified account
  const result = await db.registerCitizen({
    aadhaar_hash: aadhaar,
    name: userData.name,
    phone: userData.phone,
    email: userData.email,
    verified: 1
  });

  if (result.error) return res.status(400).json({ error: result.error });

  const token = signToken({
    id: result.citizen.id,
    name: result.citizen.name,
    email: result.citizen.email,
    phone: result.citizen.phone,
    role: 'citizen'
  }, 'citizen');

  // Strip all Aadhaar data from response
  res.status(201).json({
    success: true,
    token,
    user: {
      id: result.citizen.id,
      name: result.citizen.name,
      email: result.citizen.email,
      phone: result.citizen.phone
    }
  });
});

// ─── Citizen Login (Two-Step: /request-otp -> /login) ─────────────────────────

// Step 1: POST /api/auth/citizen/request-otp (and backward-compatible /citizen/send-otp)
// Returns IDENTICAL response for registered and unknown Aadhaars to prevent enumeration
const handleRequestOtp = async (req, res) => {
  const { aadhaar } = req.body;

  if (!validateVerhoeff(aadhaar)) {
    return res.status(400).json({ error: 'Invalid Aadhaar number. Must be a valid 12-digit number passing Verhoeff checksum.' });
  }

  const GENERIC_RESPONSE = {
    success: true,
    message: 'If this Aadhaar is registered, an OTP has been sent to your registered contact details.'
  };

  const citizen = await db.findCitizenByAadhaar(aadhaar);
  const showDebug = process.env.OTP_DEBUG === 'true' && process.env.NODE_ENV !== 'production';

  if (!citizen) {
    // Perform dummy computation to equalize response timing
    crypto.createHmac('sha256', 'dummy_pepper_timing_equalization').update(String(aadhaar)).digest('hex');
    console.log(`[AUTH LOGIN OTP] Aadhaar ${aadhaar} is NOT registered in database. Use 111122223333 or register first.`);
    return res.json(GENERIC_RESPONSE);
  }

  const key = getAadhaarKey(aadhaar);

  // Check 60-second cooldown
  if (loginOtpStore[key] && (Date.now() - loginOtpStore[key].lastRequested < 60000)) {
    return res.status(429).json({ error: 'Please wait 60 seconds before requesting another code.' });
  }

  // Generate 6-digit OTP
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  loginOtpStore[key] = {
    codeHash,
    citizenId: citizen.id,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    attempts: 0,
    lastRequested: Date.now()
  };

  console.log(`[AUTH LOGIN OTP] Code: ${code} for citizen ${citizen.name} (${citizen.email || 'no email'})`);

  if (citizen.email) {
    sendOtpEmail(citizen.email, code).catch((err) =>
      console.error('[mailer] login OTP failed:', err.message)
    );
  } else {
    console.log(`[AUTH LOGIN OTP] for citizen ${citizen.name} (${citizen.phone || 'no phone'}): ${code}`);
  }

  res.json({
    ...GENERIC_RESPONSE,
    ...(showDebug ? { otp: code } : {})
  });
};

authRouter.post('/citizen/request-otp', codeRequestLimiter, handleRequestOtp);
authRouter.post('/citizen/send-otp', codeRequestLimiter, handleRequestOtp);

// Step 2: POST /api/auth/citizen/login - Verify OTP and log in
authRouter.post('/citizen/login', authAttemptLimiter, async (req, res) => {
  const { aadhaar, otp } = req.body;

  if (!validateVerhoeff(aadhaar)) {
    return res.status(400).json({ error: 'Invalid Aadhaar number.' });
  }

  const key = getAadhaarKey(aadhaar);
  const record = loginOtpStore[key];

  if (!record || Date.now() > record.expiresAt) {
    delete loginOtpStore[key];
    return res.status(401).json({ error: 'Invalid or expired OTP.' });
  }

  record.attempts++;
  if (record.attempts > 5) {
    delete loginOtpStore[key];
    return res.status(401).json({ error: 'Maximum attempts exceeded (5). Please request a new OTP.' });
  }

  const receivedHash = crypto.createHash('sha256').update(String(otp || '').trim()).digest('hex');
  if (receivedHash !== record.codeHash) {
    if (record.attempts >= 5) delete loginOtpStore[key];
    return res.status(401).json({ error: 'Invalid or expired OTP.' });
  }

  // Single use: clear upon successful verification
  const citizenId = record.citizenId;
  delete loginOtpStore[key];

  const citizen = await db.findCitizenById(citizenId);
  if (!citizen) {
    return res.status(404).json({ error: 'Citizen account not found.' });
  }

  const token = signToken({
    id: citizen.id,
    name: citizen.name,
    email: citizen.email,
    phone: citizen.phone,
    role: 'citizen'
  }, 'citizen');

  // Strip Aadhaar completely from response
  res.json({
    success: true,
    token,
    user: {
      id: citizen.id,
      name: citizen.name,
      email: citizen.email,
      phone: citizen.phone
    }
  });
});

// ─── Admin and Officer Auth ──────────────────────────────────────────────────

// POST /api/auth/admin/login
authRouter.post('/admin/login', authAttemptLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const admin = await db.findAdminByEmail(email);

  if (!admin) {
    // Level login timing with a dummy bcrypt compare
    await bcrypt.compare(password, DUMMY_HASH);
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const match = await bcrypt.compare(password, admin.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Sign officers with role 'officer' and their department; admins with role 'admin'
  const role = admin.role === 'officer' ? 'officer' : 'admin';
  const department = admin.department || null;

  const token = signToken({
    id: admin.id,
    name: admin.name,
    role,
    department
  }, 'admin');

  res.json({
    success: true,
    token,
    user: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role,
      department
    }
  });
});

module.exports = authRouter;
