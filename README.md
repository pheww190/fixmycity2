# FixMyCity — Municipal Grievance Management System

A secure, production-hardened municipal grievance management platform built with Express 4, SQLite / MongoDB, JWT authentication, and vanilla JavaScript.

## Architecture & Technology Stack

- **Backend**: Node.js, Express 4, SQLite3 (local persistent store in `backend/data/database.sqlite`) / Mongoose (optional MongoDB connection)
- **Security**:
  - Deterministic HMAC-SHA256 Aadhaar hashing keyed by `AADHAAR_PEPPER` (never stores or leaks raw Aadhaar numbers)
  - Verhoeff checksum algorithm for Aadhaar validation
  - Two-step OTP registration (`/register` -> `/verify`) and login (`/request-otp` -> `/login`) with enumeration protection
  - Helmet Content Security Policy (CSP) and disabled `X-Powered-By`
  - Leveled login timing with dummy bcrypt comparisons
  - Express Rate Limiting across authentication, code requests, registrations, complaints, and general API endpoints
  - Stored XSS defense (`esc()`, `escAttr()`, `safeUrl()`) across all client-side innerHTML and Leaflet popups
  - Strict department scoping for officers with fail-closed enforcement
  - Status transition validation (no `Pending` to `Resolved` bypasses)
  - Magic byte image signature verification (JPEG, PNG, WEBP) rejecting non-image uploads
- **Classification**: Rule-based keyword classifier (`backend/classifier.js`) automatically routing grievances to relevant departments
- **Analytics**: Serial Python 3 Matplotlib charts piped via `stdin`
- **Frontend**: Vanilla JavaScript and CSS served statically from `frontend/`

---

## Environment Variables

See `backend/.env.example` for full documentation:

| Variable | Description | Default / Required |
|---|---|---|
| `PORT` | Web server port | `3000` |
| `NODE_ENV` | `development`, `production`, or `test` | `development` |
| `JWT_SECRET` | Secret key for signing and verifying JWT tokens | Required in production (random in dev) |
| `AADHAAR_PEPPER` | Secret pepper for HMAC-SHA256 Aadhaar hashing | Required in production |
| `PYTHON_BIN` | Python 3 executable for analytics generation | `python3` / `python` |
| `SMTP_USER` | Email username for OTP and notifications | Optional (falls back to console/Ethereal) |
| `SMTP_PASS` | Email password for SMTP | Optional |
| `OTP_DEBUG` | Echoes OTP codes in API responses (dev only) | `false` (disabled in prod) |
| `MONGO_URI` | Optional MongoDB connection URI | Optional |

---

## Installation & Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env as required
   ```

3. **Migrate legacy Aadhaar records**:
   ```bash
   # Dry-run preview
   npm run migrate:aadhaar -- --dry-run

   # Execute migration and mark accounts verified
   npm run migrate:aadhaar
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

5. **Start server**:
   ```bash
   npm start
   ```

The web application will be accessible at `http://localhost:3000`.

---

## Authentication Flow

### Citizen Registration
1. `POST /api/auth/citizen/register`: Validates 12-digit Aadhaar using Verhoeff checksum. Generates a 6-digit OTP, hashes it at rest (SHA-256), and emails it with a 5-minute expiry and 60-second cooldown.
2. `POST /api/auth/citizen/verify`: Validates the OTP (max 5 attempts, single-use). Stores the user in the database with HMAC-SHA256 hashed Aadhaar, marked `verified = 1`, and issues a citizen JWT.

### Citizen Login
1. `POST /api/auth/citizen/request-otp`: Accepts 12-digit Aadhaar. Returns an identical response regardless of whether the Aadhaar is registered or unknown to prevent citizen enumeration.
2. `POST /api/auth/citizen/login`: Validates the 6-digit OTP and issues a citizen JWT.

### Staff & Officer Login
- `POST /api/auth/admin/login`:
  - Officers receive role `'officer'` and their specific `department`.
  - Admins receive role `'admin'`.
  - Timing is leveled with a dummy bcrypt comparison for unknown emails.
  - Officer access to `/all`, `/stats`, `/python-stats`, `/geotagged`, `/assign`, `/status`, and `/:id` is scoped strictly to their department. If an officer has no department, access fails closed.
