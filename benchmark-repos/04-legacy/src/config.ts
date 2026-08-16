// Old config file - uses hardcoded values
// DEPRECATED - use env.ts or config/index.ts instead

export const config = {
  // Server
  PORT: 3000,
  HOST: '0.0.0.0',
  NODE_ENV: 'development',

  // Database
  DB_HOST: 'localhost',
  DB_PORT: 5432,
  DB_NAME: 'myapp_dev',
  DB_USER: 'postgres',
  DB_PASS: 'password', // TODO: move to env

  // Redis
  REDIS_HOST: 'localhost',
  REDIS_PORT: 6379,

  // Auth
  JWT_SECRET: 'super-secret-jwt-key', // TODO: move to env
  JWT_EXPIRY: '24h',
  REFRESH_EXPIRY: '7d',

  // Stripe
  STRIPE_SECRET_KEY: 'sk_test_123', // TODO: move to env
  STRIPE_WEBHOOK_SECRET: 'whsec_123',

  // Email
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: 587,
  SMTP_USER: 'noreply@example.com',
  SMTP_PASS: 'email-password',

  // Logging
  LOG_LEVEL: 'info',
  LOG_FILE: '/var/log/app.log',

  // Features
  ENABLE_REGISTRATION: true,
  ENABLE_MFA: false, // Old setting, always false
  MAX_UPLOAD_SIZE: 10 * 1024 * 1024, // 10MB
};
