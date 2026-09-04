// Old API constants - DEPRECATED
// DO NOT USE for new code, use constants from constants.ts

export const API_VERSION = 'v1'; // OLD - current is v3
export const BASE_URL = 'http://localhost:3000';
export const API_PREFIX = '/api/v1'; // OLD - should be /api/v3

// Deprecated endpoints
export const ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  LOGOUT: '/auth/logout',
  USERS: '/users',
  PAYMENTS: '/payments',
  // Old webhook paths
  STRIPE_WEBHOOK: '/webhooks/stripe',
  PAYPAL_WEBHOOK: '/webhooks/paypal',
};

// Legacy status codes
export const STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ERROR: 500,
};

// Old error messages
export const ERRORS = {
  INVALID_CREDENTIALS: 'Invalid username or password',
  UNAUTHORIZED: 'You are not authorized',
  NOT_FOUND: 'Resource not found',
  SERVER_ERROR: 'Internal server error',
  RATE_LIMITED: 'Too many requests',
};

// Roles (old system)
export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer',
  GUEST: 'guest', // Old role, no longer used
};

// Plan types (old system)
export const PLANS = {
  FREE: 'free',
  BASIC: 'basic',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
  LEGACY: 'legacy', // Old plan, deprecated
};
