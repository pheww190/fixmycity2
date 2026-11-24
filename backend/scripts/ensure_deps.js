#!/usr/bin/env node
// Installs the backend dependencies if they are missing, so `npm start` works
// straight from a fresh copy of the project.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const MODULES = path.join(BACKEND, 'node_modules');

if (fs.existsSync(path.join(MODULES, 'express'))) process.exit(0);

console.log('Installing backend dependencies (first run)…');
const result = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
  cwd: BACKEND,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
process.exit(result.status ?? 1);
