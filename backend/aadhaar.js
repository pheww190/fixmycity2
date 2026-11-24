// backend/aadhaar.js - Aadhaar cryptographic hashing and Verhoeff validation
const crypto = require('crypto');

// Enforce AADHAAR_PEPPER requirement in production
if (process.env.NODE_ENV === 'production' && !process.env.AADHAAR_PEPPER) {
  throw new Error('FATAL: AADHAAR_PEPPER environment variable must be set in production');
}

/**
 * Returns deterministic HMAC-SHA256 of Aadhaar using AADHAAR_PEPPER.
 * Preserves lookup capability while preventing raw digit storage or exposure.
 */
function hashAadhaar(aadhaar) {
  const pepper = process.env.AADHAAR_PEPPER || 'municipal_aadhaar_pepper_dev_secret_2026';
  const cleanAadhaar = String(aadhaar || '').trim().replace(/\s+/g, '');
  return crypto.createHmac('sha256', pepper).update(cleanAadhaar).digest('hex');
}

// ─── Verhoeff Checksum Algorithm ─────────────────────────────────────────────
// Multiplication table (d)
const dTable = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

// Permutation table (p)
const pTable = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

// Inverse table (inv)
const invTable = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates a 12-digit Aadhaar number using the Verhoeff checksum algorithm.
 */
function validateVerhoeff(numStr) {
  if (typeof numStr !== 'string') numStr = String(numStr || '');
  const clean = numStr.trim().replace(/\s+/g, '');
  if (!/^\d{12}$/.test(clean)) return false;

  let c = 0;
  const digits = clean.split('').map(Number).reverse();
  for (let i = 0; i < digits.length; i++) {
    c = dTable[c][pTable[i % 8][digits[i]]];
  }
  return c === 0;
}

/**
 * Generates the Verhoeff check digit for an 11-digit string.
 */
function generateVerhoeff(numStr) {
  if (typeof numStr !== 'string') numStr = String(numStr || '');
  const clean = numStr.trim().replace(/\s+/g, '');
  let c = 0;
  const digits = clean.split('').map(Number).reverse();
  for (let i = 0; i < digits.length; i++) {
    c = dTable[c][pTable[(i + 1) % 8][digits[i]]];
  }
  return invTable[c];
}

module.exports = {
  hashAadhaar,
  validateVerhoeff,
  generateVerhoeff
};
