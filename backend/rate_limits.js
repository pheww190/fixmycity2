// backend/rate_limits.js - Express rate limiting configuration
const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

// 600 API calls / 15 min (applied globally to /api/*)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API requests. Please try again later.' }
});

// 10 auth attempts / 15 min (applied to login, verify endpoints)
const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 100 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

// 5 code requests / 15 min (applied to request-otp, send-otp)
const codeRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 50 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP code requests. Please try again after 15 minutes.' }
});

// 10 registrations / hour (applied to registration endpoints)
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isTest ? 100 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account registrations. Please try again after an hour.' }
});

// 20 complaints / hour (applied to POST /api/complaints)
const complaintLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isTest ? 100 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Grievance submission limit reached (20 per hour). Please try again later.' }
});

module.exports = {
  apiLimiter,
  authAttemptLimiter,
  codeRequestLimiter,
  registrationLimiter,
  complaintLimiter
};
