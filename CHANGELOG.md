# Changelog: Security and Correctness Hardening

All modifications made during the security and correctness audit of the Municipal Grievance system, mapped to the requested items:

---

## 1. CLOSE THE AADHAAR LEAK (critical)
- **`backend/db.js`**:
  - Removed `aadhaar: citizen.aadhaar_hash` from `getComplaintWithCitizen()`.
  - Sanitized the citizen record returned so `aadhaar_hash` is stripped and no response contains an Aadhaar number in any form.
  - Added `verified` column to `citizens` table schema with auto-migration.
  - Updated `registerCitizen()` and `findCitizenByAadhaar()` to store and query Aadhaar strictly as deterministic HMAC-SHA256 hashes.
- **`backend/routes/complaints.js`**:
  - Required session authentication (`requireSession`) on `GET /api/complaints/:id`.
  - Restricted citizens to reading only their own complaints (returns 404, not 403, on id mismatch to prevent enumeration).
  - Restricted officers to reading only complaints in their assigned department (returns 404 on department mismatch).
  - Ensured staff receive citizen contact details (name, phone, email) while citizens do not receive citizen contact blocks.
  - Strictly deleted any `aadhaar` or `aadhaar_hash` field from the response.
- **`backend/aadhaar.js`**:
  - Created cryptographic Aadhaar utility with `hashAadhaar(aadhaar)` using HMAC-SHA256 keyed by `process.env.AADHAAR_PEPPER`.
  - Added startup check throwing an error in production if `AADHAAR_PEPPER` is unset.
- **`backend/index.js`**:
  - Added startup check throwing a fatal error in production if `AADHAAR_PEPPER` is missing.
- **`frontend/admin/dashboard.html` & `frontend/admin/dashboard.js`**:
  - Removed the Aadhaar row (`#modalAadhaar`) from the complaint details modal in `dashboard.html`.
  - Removed the corresponding DOM assignment in `dashboard.js`.
- **`backend/migrate_aadhaar.js` & `package.json`**:
  - Implemented `npm run migrate:aadhaar` script supporting `--dry-run` flag.
  - Iterates over `citizens` table, rewrites legacy raw values to HMAC-SHA256, and marks those accounts `verified = 1`.

---

## 2. REMOVE STORED XSS (critical)
- **`frontend/shared/escape.js`**:
  - Created client-side escaping library exposing `esc()`, `escAttr()`, and `safeUrl()`.
  - `safeUrl()` strictly rejects dangerous protocols (`javascript:`, `data:`, `vbscript:`).
- **HTML Pages Loading `escape.js`**:
  - Added `<script src="/shared/escape.js"></script>` to `frontend/admin/dashboard.html`, `frontend/citizen/my-complaints.html`, `frontend/citizen/portal.html`, `frontend/admin/login.html`, `frontend/citizen/login.html`, `frontend/admin/map.html`, `frontend/public-map.html`, and `frontend/citizen/register.html`.
- **`frontend/admin/dashboard.js`**:
  - Escaped all complaint table interpolations (`complaint_id`, `description`, `location`, `category`, `priority`, `status`).
  - Replaced inline `onclick` handlers on links, photos, and rows with `data-id` attributes and delegated click/change event listeners on `#complaintsBody`.
  - Escaped modal status badge, timeline entries, toast notifications, translation preview, and merge badge counts.
- **`frontend/citizen/my-complaints.js`**:
  - Escaped complaint history cards, status badges, timelines, ratings, and comments.
  - Replaced inline `onclick="openFeedbackModal(...)"` with `data-id` attributes and delegated click listener on `#complaintsList`.
  - Sanitized Twitter share URL building.
- **`frontend/citizen/portal.js`**:
  - Replaced `innerHTML` in `mainBadge` with `textContent`.
  - Escaped toast notifications.
- **`frontend/admin/login.js`, `frontend/citizen/login.js`, `frontend/citizen/register.js`**:
  - Escaped message text in `showToast()`.
- **`frontend/admin/map.html` & `frontend/public-map.html`**:
  - Escaped all Leaflet popup interpolations (`complaint_id`, `status`, `category`, `description`, `support_count`).
  - Sanitized image URLs with `safeUrl(photo_url)`.

---

## 3. SCOPE OFFICERS TO THEIR DEPARTMENT (high)
- **`backend/routes/auth.js`**:
  - In `POST /api/auth/admin/login`, signed department officers with role `'officer'` and their specific `department`. Admins are signed with role `'admin'`.
- **`backend/auth.js`**:
  - Updated `requireAdmin` middleware to accept both `'admin'`, `'superadmin'`, and `'officer'` roles.
  - Implemented `departmentScope(user)` helper returning `null` for full-access admins, the department string for officers, and `'__FAIL_CLOSED__'` for officers with no/empty department.
- **`backend/routes/complaints.js`**:
  - Applied `departmentScope(req.user)` across `/all`, `/stats`, `/python-stats`, `/geotagged`, `/assign`, `/status`, and `/:id`.
  - Enforced fail-closed behavior: officer tokens without a department match zero rows or return 404.
- **`backend/db.js`**:
  - Updated `getAllComplaints()` to filter strictly by `filters.department`.
  - Updated `getGeotaggedComplaints()` and `getStats()` to respect department filtering and fail closed on `'__FAIL_CLOSED__'`.

---

## 4. HARDEN CITIZEN AUTH (critical)
- **`backend/routes/auth.js`**:
  - Removed insecure Aadhaar+phone login.
  - Implemented two-step OTP registration: `POST /api/auth/citizen/register` (generates 6-digit code) -> `POST /api/auth/citizen/verify` (verifies OTP, hashes Aadhaar, issues token).
  - Implemented two-step OTP login: `POST /api/auth/citizen/request-otp` (sends OTP) -> `POST /api/auth/citizen/login` (verifies OTP, issues token).
  - Configured OTP lifecycle: 6 digits, SHA-256 hashed at rest, 5-minute expiry, single-use with deletion on verification, maximum 5 attempts, and 60-second resend cooldown.
  - Implemented enumeration defense: `/request-otp` returns an identical response and message regardless of whether the Aadhaar is registered or unknown.
  - Leveled admin login timing with a dummy bcrypt comparison when email is not found.
- **`backend/aadhaar.js`**:
  - Implemented Verhoeff checksum algorithm for validating 12-digit Aadhaar numbers.
- **`backend/rate_limits.js`**:
  - Configured rate limiters:
    - 600 requests / 15 min globally on `/api/*`
    - 10 auth attempts / 15 min on login/verify
    - 5 code requests / 15 min on request-otp/register
    - 10 registrations / hour on `/register`
    - 20 complaints / hour on `POST /api/complaints`
- **`backend/auth.js` & `backend/index.js`**:
  - Integrated Helmet with strict CSP supporting all external CDNs used across the site.
  - Disabled `X-Powered-By` header.
  - Enforced `JWT_SECRET` production requirement (throws if unset); generates ephemeral per-process secret in development.
- **`frontend/citizen/login.js` & `frontend/citizen/register.html` / `register.js`**:
  - Updated login UI to request OTP via `/request-otp` and verify via `/login`.
  - Added two-step verification UI to registration page calling `/register` and `/verify`.

---

## 5. FIX BROKEN BEHAVIOUR
- **`backend/routes/complaints.js`**:
  - Moved literal paths (`/mine`, `/all`, `/geotagged`, `/stats`, `/python-stats`, `/public/map`, `/check-nearby`) before parameterized `/:id` route so `/public/map` no longer gets trapped by `/:id`.
  - Serialized concurrent Python chart generation requests using a promise queue (`generateChartsSerial`).
  - Replaced shell `exec` with `execFile(process.env.PYTHON_BIN || 'python3', [scriptPath])` and piped JSON through `stdin`.
  - Validated `PATCH /:id/status` against `['Pending', 'In Progress', 'Resolved', 'Rejected']` and blocked direct `Pending` -> `Resolved` transitions and edits to closed complaints.
  - Added magic byte signature verification (JPEG, PNG, WEBP) in `handlePhotoUpload` and deleted rejected files.
  - Wrapped Multer in error middleware returning JSON 413 on oversize rather than HTML stack traces.
  - Added pagination to `/all` and `/public/map`.
  - Stripped all citizen PII (name, email, phone, citizen_id, aadhaar) from `/public/map`.
  - Accepted `zone` field from request body and updated `check-nearby` to run in auto-detect mode if no category is specified.
- **`backend/generate_charts.py`**:
  - Added support for reading JSON data from `sys.stdin`.
- **`frontend/citizen/portal.html` & `frontend/citizen/portal.js`**:
  - Added `Zone` select dropdown to the complaint filing form (`Central`, `North`, `South`, `East`, `West`).
  - Updated `portal.js` to submit `zone` and run nearby duplicate check even when category is left on auto-detect.
- **`backend/db.js`**:
  - Updated `findAdminByEmail` to perform case-insensitive collation lookup (`COLLATE NOCASE`) instead of RegExp.
  - Added `closeDatabase()` for graceful shutdown.
- **`backend/index.js`**:
  - Imported `express-async-errors` so unhandled asynchronous route rejections reach the error middleware.
  - Added JSON 404 handler for all unmatched `/api/*` routes.
  - Added global error-handling middleware that suppresses stack traces and internal errors in production.
  - Implemented graceful shutdown on `SIGTERM` and `SIGINT` signals with server and database cleanup.

---

## 6. REPO HYGIENE
- **`.gitignore`**:
  - Corrected ignore path from `server/uploads/` to `backend/uploads/` and verified untracked status of upload artifacts.
- **`backend/.env.example`**:
  - Added documentation for all environment variables (`PORT`, `NODE_ENV`, `JWT_SECRET`, `AADHAAR_PEPPER`, `PYTHON_BIN`, `SMTP_USER`, `SMTP_PASS`, `OTP_DEBUG`, `MONGO_URI`).
- **File Cleanups**:
  - Removed dead/broken files: `verify_features.js`, `frontend/dashboard.js`, and `frontend/admin/login1.html`.
  - Flagged legacy/seed files with clear deprecation headers: `backend/data/complaints.json`, `backend/data/db.json`, `backend/force_seed.js`, `backend/reset_admins.js`, and `scratch/test_exif.js`.
- **Documentation**:
  - Rewrote `README.md` and `guide.txt` to reflect the rule-based keyword classifier, two-step OTP authentication, and environment configuration.
