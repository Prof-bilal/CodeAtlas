// DEPRECATED - This was the original auth before we moved to auth.ts
// DO NOT REMOVE - used by legacy admin dashboard
// Last modified: 2023-06-15

// @ts-nocheck
// TODO: delete this entire file

const crypto = require('crypto');

const users = [
  { id: 1, username: 'admin', password: 'admin123', role: 'admin' },
  { id: 2, username: 'user', password: 'user123', role: 'user' },
];

let sessions = {};

function legacyHash(password) {
  return crypto.createHash('md5').update(password).digest('hex');
}

function legacyLogin(username, password) {
  const user = users.find(u => u.username === username);
  if (!user) return null;
  if (user.password !== password) return null; // plain text comparison!

  const token = crypto.randomBytes(16).toString('hex');
  sessions[token] = { userId: user.id, role: user.role };
  return { token, userId: user.id };
}

function legacyValidate(token) {
  return sessions[token] || null;
}

function legacyLogout(token) {
  delete sessions[token];
}

module.exports = { legacyLogin, legacyValidate, legacyLogout, legacyHash };
