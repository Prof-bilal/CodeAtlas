export interface AppConfig {
  port: number;
  host: string;
  env: string;
  logLevel: string;
  cors: CorsConfig;
  rateLimit: RateLimitConfig;
  auth: AuthConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  email: EmailConfig;
  storage: StorageConfig;
}

export interface CorsConfig {
  origin: string | string[];
  credentials: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export interface StorageConfig {
  type: string;
  path: string;
  maxSize: number;
}

export const defaultConfig: AppConfig = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || 'localhost',
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100,
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'default-secret',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    bcryptRounds: 12,
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'platform',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  email: {
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@example.com',
  },
  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    path: process.env.STORAGE_PATH || './uploads',
    maxSize: parseInt(process.env.STORAGE_MAX_SIZE || '10485760'),
  },
};
