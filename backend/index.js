// server/index.js
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('express-async-errors');
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const fs = require("fs");
const db = require("./db");
const { apiLimiter } = require("./rate_limits");

// Enforce required security environment variables in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.AADHAAR_PEPPER) {
    throw new Error('FATAL: AADHAAR_PEPPER environment variable must be set in production');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set in production');
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Disable x-powered-by header
app.disable('x-powered-by');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Seed admin users safely (boot even if DB isn't immediately connected)
try {
  db.seedAdmins();
} catch (err) {
  console.error('Initial DB seeding skipped/failed:', err.message);
}

// Background Escalation Check (Every 1 minute)
const escalationTimer = setInterval(() => {
  try {
    db.escalateComplaints();
  } catch (err) {
    console.error('Escalation check error:', err.message);
  }
}, 60000);
if (escalationTimer.unref) escalationTimer.unref();

// Helmet with CSP permitting necessary CDNs
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://cdnjs.cloudflare.com"
      ],
      // The pages use inline onclick="..." handlers. Helmet defaults this
      // directive to 'none', which silently disables every one of them.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://unpkg.com",
        "https://cdnjs.cloudflare.com",
        "https://fonts.googleapis.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://upload.wikimedia.org",
        "https://*.tile.openstreetmap.org",
        "https://tile.openstreetmap.org",
        "https://unpkg.com",
        "https://*.basemaps.cartocdn.com",
        "https://basemaps.cartocdn.com",
        "https://tiles.openfreemap.org",
        "https://www.transparenttextures.com"
      ],
      connectSrc: [
        "'self'",
        "https://nominatim.openstreetmap.org",
        "https://photon.komoot.io",
        "https://*.basemaps.cartocdn.com",
        "https://basemaps.cartocdn.com",
        "https://tiles.openfreemap.org"
      ],
      workerSrc: [
        "'self'",
        "blob:",
        "https://unpkg.com"
      ],
      fontSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com",
        "https://fonts.gstatic.com"
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  }
}));

// Global Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting to all /api/* routes (600 requests / 15 min)
app.use("/api", apiLimiter);

// Static files
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use("/uploads", express.static(uploadsDir));
app.use("/uploads/charts", express.static(path.join(uploadsDir, "charts")));
app.use("/pho", express.static(path.join(__dirname, "..", "frontend", "pho")));
app.get("/dceaec64-e059-4d57-b642-0b515e8a4f0a.png", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "dceaec64-e059-4d57-b642-0b515e8a4f0a.png"));
});

// API routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/complaints", require("./routes/complaints"));
app.use("/api/features", require("./routes/features"));

// Database status check
app.get("/api/db-status", (req, res) => {
  const status = db.getConnectionStatus();
  res.json({
    connected: status === 1,
    status: status === 1 ? 'connected' : 'disconnected',
    database: 'SQLite'
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    db_status: db.getConnectionStatus() === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});

// Frontend routes
app.get("/citizen/login", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "login.html"))
);

app.get("/citizen/register", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "register.html"))
);

app.get("/citizen/portal", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "portal.html"))
);

app.get("/citizen/my-complaints", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "my-complaints.html"))
);

app.get("/citizen/feed", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "feed.html"))
);

app.get("/citizen/hub", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "hub.html"))
);

app.get("/citizen/funding", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "funding.html"))
);

app.get("/citizen/polls", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "polls.html"))
);

app.get("/admin/login", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "admin", "login.html"))
);

app.get("/admin/dashboard", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "admin", "dashboard.html"))
);

app.get("/admin/map", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "admin", "map.html"))
);

app.get("/admin/analytics", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "admin", "analytics.html"))
);

app.get("/admin/features", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "admin", "features.html"))
);

app.get("/admin/scorecards", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "admin", "scorecards.html"))
);

app.get("/admin/mobile", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "admin", "mobile.html"))
);

app.get("/citizen/community", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "community.html"))
);

app.get("/citizen/leaderboard", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "leaderboard.html"))
);

app.get("/transparency.html", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "transparency.html"))
);

app.get("/track", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "citizen", "track.html"))
);

// Home redirect
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

// JSON 404 for unmatched /api/* routes
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global error handler (hides internal details in production)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd || status === 500) {
    console.error('Unhandled error:', err);
  }
  res.status(status).json({
    error: isProd && status === 500 ? 'Internal server error' : (err.message || 'An unexpected error occurred')
  });
});

// Start server
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Graceful shutdown handling
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  clearInterval(escalationTimer);
  if (server) {
    server.close(() => {
      console.log('HTTP server closed.');
      if (typeof db.closeDatabase === 'function') {
        db.closeDatabase(() => {
          console.log('Database connection closed.');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
