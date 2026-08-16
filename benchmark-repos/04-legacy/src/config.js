// JavaScript config file - DIFFERENT PORT!
// Used by the admin panel separately
// @ts-nocheck

const path = require('path');

// WARNING: This uses port 3001 instead of 3000
const config = {
  port: 3001,
  host: '127.0.0.1',

  // Database (same as main config)
  database: {
    host: 'localhost',
    port: 5432,
    name: 'myapp_admin',
    user: 'postgres',
    password: 'password',
  },

  // Redis (different db number)
  redis: {
    host: 'localhost',
    port: 6379,
    db: 1, // Main app uses db 0
  },

  // Session
  session: {
    secret: 'admin-session-secret', // TODO: consolidate with main
    maxAge: 3600000, // 1 hour
  },

  // Views
  views: {
    directory: path.join(__dirname, 'views'),
    engine: 'ejs',
  },

  // Static files
  static: {
    directory: path.join(__dirname, 'public'),
  },

  // Admin specific
  admin: {
    enabled: true,
    defaultRole: 'admin',
    allowSelfRegistration: false, // Never enable this
  },

  // Logging
  logging: {
    level: 'debug',
    file: '/var/log/admin.log',
  },
};

module.exports = config;
