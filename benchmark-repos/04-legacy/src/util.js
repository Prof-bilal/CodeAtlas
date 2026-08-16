// Old JavaScript utilities file
// DO NOT USE - kept for backward compatibility
// @ts-nocheck

const crypto = require('crypto');

function formatDate(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function generateToken(length) {
  return crypto.randomBytes(length || 32).toString('hex');
}

function hashString(str, algorithm) {
  return crypto.createHash(algorithm || 'sha256').update(str).digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retry(fn, maxAttempts, delay) {
  maxAttempts = maxAttempts || 3;
  delay = delay || 1000;

  return new Promise((resolve, reject) => {
    let attempts = 0;

    function attempt() {
      attempts++;
      fn()
        .then(resolve)
        .catch(err => {
          if (attempts >= maxAttempts) {
            reject(err);
          } else {
            setTimeout(attempt, delay * attempts);
          }
        });
    }

    attempt();
  });
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isEmpty(obj) {
  if (obj === null || obj === undefined) return true;
  if (typeof obj === 'string') return obj.length === 0;
  if (Array.isArray(obj)) return obj.length === 0;
  return Object.keys(obj).length === 0;
}

// TODO: remove this
function legacyEncrypt(text, key) {
  const cipher = crypto.createCipher('aes-256-cbc', key);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function legacyDecrypt(encrypted, key) {
  const decipher = crypto.createDecipher('aes-256-cbc', key);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = {
  formatDate,
  formatTime,
  generateToken,
  hashString,
  sleep,
  retry,
  deepClone,
  isEmpty,
  legacyEncrypt,
  legacyDecrypt,
};
