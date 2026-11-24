// backend/migrate_aadhaar.js - Migration script for rewriting legacy Aadhaar values to HMAC-SHA256
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { hashAadhaar } = require('./aadhaar');

const isDryRun = process.argv.includes('--dry-run');
const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');

console.log(`Starting Aadhaar migration... Mode: ${isDryRun ? 'DRY RUN (no changes applied)' : 'LIVE EXECUTION'}`);

const db = new sqlite3.Database(DB_PATH, async (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
    process.exit(1);
  }

  // Ensure column exists
  db.run(`ALTER TABLE citizens ADD COLUMN verified INTEGER DEFAULT 0`, () => {
    db.all(`SELECT id, aadhaar_hash, verified FROM citizens`, async (err, rows) => {
      if (err) {
        console.error('Error querying citizens:', err.message);
        db.close();
        process.exit(1);
      }

      console.log(`Found ${rows.length} citizen record(s) to inspect.`);
      let toMigrateCount = 0;
      let alreadyMigratedCount = 0;

      for (const row of rows) {
        const currentVal = row.aadhaar_hash;
        const isHex64 = /^[a-f0-9]{64}$/i.test(currentVal);

        if (!isHex64) {
          toMigrateCount++;
          const newHash = hashAadhaar(currentVal);
          if (isDryRun) {
            console.log(`[DRY RUN] Would rewrite citizen ID: ${row.id} -> Hash: ${newHash.substring(0, 16)}... and mark verified=1`);
          } else {
            await new Promise((resolve, reject) => {
              db.run(`UPDATE citizens SET aadhaar_hash = ?, verified = 1 WHERE id = ?`, [newHash, row.id], function(updateErr) {
                if (updateErr) return reject(updateErr);
                console.log(`[UPDATED] Rewrote citizen ID: ${row.id} -> Hash: ${newHash.substring(0, 16)}..., verified=1`);
                resolve();
              });
            });
          }
        } else {
          alreadyMigratedCount++;
          if (!row.verified && !isDryRun) {
            await new Promise((resolve) => {
              db.run(`UPDATE citizens SET verified = 1 WHERE id = ?`, [row.id], () => resolve());
            });
          }
        }
      }

      console.log('\n--- Migration Summary ---');
      console.log(`Total records: ${rows.length}`);
      console.log(`Legacy records ${isDryRun ? 'identified for migration' : 'migrated'}: ${toMigrateCount}`);
      console.log(`Already-hashed records: ${alreadyMigratedCount}`);
      console.log(isDryRun ? 'Dry run finished. No writes performed.' : 'Migration completed successfully.');

      db.close();
    });
  });
});
