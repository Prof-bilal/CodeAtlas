// Settings file - partially overlaps with config.ts
// Some settings are here, some in config.ts, some in env.ts
// TODO: consolidate all settings files

import { config } from './config';

export interface AppSettings {
  // Server settings
  server: {
    port: number;
    host: string;
    keepAliveTimeout: number;
    headersTimeout: number;
  };

  // CORS settings
  cors: {
    origin: string | string[];
    credentials: boolean;
    methods: string[];
  };

  // Rate limiting
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    message: string;
  };

  // Upload settings
  upload: {
    maxFileSize: number;
    allowedTypes: string[];
    destination: string;
  };

  // Email settings
  email: {
    from: string;
    replyTo: string;
    templates: Record<string, string>;
  };

  // Feature flags
  features: {
    registration: boolean;
    mfa: boolean;
    darkMode: boolean;
    betaFeatures: boolean;
  };
}

const settings: AppSettings = {
  server: {
    port: config.PORT,
    host: config.HOST,
    keepAliveTimeout: 5000,
    headersTimeout: 60000,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: 'Too many requests, please try again later',
  },

  upload: {
    maxFileSize: config.MAX_UPLOAD_SIZE,
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    destination: '/uploads',
  },

  email: {
    from: '"MyApp" <noreply@myapp.com>',
    replyTo: 'support@myapp.com',
    templates: {
      welcome: 'welcome',
      passwordReset: 'password-reset',
      emailVerify: 'email-verify',
    },
  },

  features: {
    registration: config.ENABLE_REGISTRATION,
    mfa: config.ENABLE_MFA,
    darkMode: true,
    betaFeatures: false,
  },
};

export default settings;
