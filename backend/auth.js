// server/auth.js - JWT auth helpers and middleware
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// JWT_SECRET: No hardcoded fallback — throw in production, random per-process secret in development
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable must be set in production');
  }
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET = JWT_SECRET;
}

function getJwtSecret() {
  return process.env.JWT_SECRET || JWT_SECRET;
}

function signToken(payload, authType = 'citizen') {
  const expiresIn = (authType === 'admin' || payload.role === 'admin' || payload.role === 'officer') ? '8h' : '24h';
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// Middleware — require citizen JWT
function requireCitizen(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required. Please log in.' });
  const decoded = verifyToken(token);
  if (!decoded || (decoded.role && decoded.role !== 'citizen')) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  req.user = decoded;
  next();
}

// Middleware — require admin / officer JWT
function requireAdmin(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Admin authentication required.' });
  const decoded = verifyToken(token);
  if (!decoded || !['admin', 'superadmin', 'officer'].includes(decoded.role)) {
    return res.status(401).json({ error: 'Admin access only.' });
  }
  req.user = decoded;
  next();
}

// Middleware — require any valid authenticated session (citizen, officer, or admin)
function requireSession(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required. Please log in.' });
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  req.user = decoded;
  next();
}

/**
 * Returns department scope for an officer/admin user.
 * Admins/superadmins get null (full access).
 * Officers with a department get their department string.
 * Officers without a department fail closed by returning '__FAIL_CLOSED__'.
 */
function departmentScope(user) {
  if (!user) return '__FAIL_CLOSED__';
  if (user.role === 'admin' || user.role === 'superadmin') {
    return null;
  }
  if (user.role === 'officer') {
    if (!user.department || typeof user.department !== 'string' || !user.department.trim()) {
      return '__FAIL_CLOSED__';
    }
    return user.department.trim();
  }
  return '__FAIL_CLOSED__';
}

module.exports = {
  signToken,
  verifyToken,
  requireCitizen,
  requireAdmin,
  requireSession,
  departmentScope
};
