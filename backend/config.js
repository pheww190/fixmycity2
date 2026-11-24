// backend/config.js - shared configuration
// Both data modules must open the SAME file; a second path is what produced
// "database is locked" and made tests write to the real database.
const path = require('path');
const os = require('os');

const DB_PATH =
  process.env.DB_PATH ||
  (process.env.NODE_ENV === 'test'
    ? path.join(os.tmpdir(), `fixmycity-test-${process.pid}.sqlite`)
    : path.join(__dirname, 'data', 'database.sqlite'));

module.exports = { DB_PATH };
