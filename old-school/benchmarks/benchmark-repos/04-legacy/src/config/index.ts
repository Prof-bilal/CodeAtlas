// Config index - CURRENT

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000'),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
};
