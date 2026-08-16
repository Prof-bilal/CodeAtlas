// API client - OLD
// DEPRECATED - use proper HTTP client

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/v1';

module.exports = {
  get: (path) => axios.get(${API_BASE}).then(r => r.data),
  post: (path, data) => axios.post(${API_BASE}, data).then(r => r.data),
  put: (path, data) => axios.put(${API_BASE}, data).then(r => r.data),
  delete: (path) => axios.delete(${API_BASE}).then(r => r.data),
};
