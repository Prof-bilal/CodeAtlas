// JavaScript login handler for admin panel
// This file exists because the admin panel is still a Node.js app
// using CommonJS. DO NOT convert to TypeScript yet.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Hardcoded admin credentials (TODO: move to database)
const ADMIN_USERS = [
  { id: 1, username: 'superadmin', password: 'admin2023!', role: 'superadmin' },
  { id: 2, username: 'admin', password: 'admin123', role: 'admin' },
];

let sessions = {};

router.post('/login', function(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = ADMIN_USERS.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // WARNING: plain text comparison - old system
  if (user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = {
    userId: user.id,
    username: user.username,
    role: user.role,
    loginAt: new Date().toISOString(),
  };

  console.log(`Admin login: ${username} at ${new Date().toISOString()}`);

  res.json({
    success: true,
    token: token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

router.post('/logout', function(req, res) {
  const token = req.headers.authorization;
  if (token && sessions[token]) {
    delete sessions[token];
  }
  res.json({ success: true });
});

router.get('/me', function(req, res) {
  const token = req.headers.authorization;
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: sessions[token] });
});

// TODO: add password change endpoint
// TODO: add session refresh

module.exports = router;
