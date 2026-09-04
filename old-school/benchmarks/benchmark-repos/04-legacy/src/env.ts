// Environment configuration
// Reads from process.env with fallbacks
// Overlaps with config.ts but uses proper env vars

import dotenv from 'dotenv';
dotenv.config();

export const env = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/myapp',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || 'myapp_dev',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || '',

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Auth
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '15m',
  REFRESH_SECRET: process.env.REFRESH_SECRET || '',
  REFRESH_EXPIRY: process.env.REFRESH_EXPIRY || '7d',

  // Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',

  // Email
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || '',

  // Features
  ENABLE_REGISTRATION: process.env.ENABLE_REGISTRATION !== 'false',
  ENABLE_MFA: process.env.ENABLE_MFA === 'true',
  ENABLE_BETA: process.env.ENABLE_BETA === 'true',

  // External services
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  DATADOG_API_KEY: process.env.DATADOG_API_KEY || '',
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
} as const;

// Validate required env vars
const required = ['JWT_SECRET', 'DATABASE_URL'] as const;
for (const key of required) {
  if (!env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export type Env = typeof env;
