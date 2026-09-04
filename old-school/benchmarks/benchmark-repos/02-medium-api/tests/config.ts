export interface TestConfig {
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  stripe: {
    secretKey: string;
    publishableKey: string;
  };
}

export const testConfig: TestConfig = {
  database: {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    name: process.env.TEST_DB_NAME || 'platform_test',
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || '',
  },
  redis: {
    host: process.env.TEST_REDIS_HOST || 'localhost',
    port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
  },
  jwt: {
    secret: process.env.TEST_JWT_SECRET || 'test-secret',
    expiresIn: '1h',
  },
  stripe: {
    secretKey: process.env.TEST_STRIPE_SECRET_KEY || 'sk_test_...',
    publishableKey: process.env.TEST_STRIPE_PUBLISHABLE_KEY || 'pk_test_...',
  },
};
