import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/types/config.js';

describe('Config', () => {
  describe('defaultConfig', () => {
    it('should have default config', () => {
      expect(defaultConfig).toBeDefined();
      expect(defaultConfig.port).toBeDefined();
      expect(defaultConfig.host).toBeDefined();
      expect(defaultConfig.env).toBeDefined();
    });

    it('should have cors config', () => {
      expect(defaultConfig.cors).toBeDefined();
      expect(defaultConfig.cors.origin).toBeDefined();
      expect(defaultConfig.cors.credentials).toBeDefined();
    });

    it('should have rate limit config', () => {
      expect(defaultConfig.rateLimit).toBeDefined();
      expect(defaultConfig.rateLimit.windowMs).toBeDefined();
      expect(defaultConfig.rateLimit.max).toBeDefined();
    });

    it('should have auth config', () => {
      expect(defaultConfig.auth).toBeDefined();
      expect(defaultConfig.auth.jwtSecret).toBeDefined();
      expect(defaultConfig.auth.jwtExpiresIn).toBeDefined();
      expect(defaultConfig.auth.bcryptRounds).toBeDefined();
    });

    it('should have database config', () => {
      expect(defaultConfig.database).toBeDefined();
      expect(defaultConfig.database.host).toBeDefined();
      expect(defaultConfig.database.port).toBeDefined();
      expect(defaultConfig.database.name).toBeDefined();
    });

    it('should have redis config', () => {
      expect(defaultConfig.redis).toBeDefined();
      expect(defaultConfig.redis.host).toBeDefined();
      expect(defaultConfig.redis.port).toBeDefined();
    });

    it('should have email config', () => {
      expect(defaultConfig.email).toBeDefined();
      expect(defaultConfig.email.host).toBeDefined();
      expect(defaultConfig.email.port).toBeDefined();
    });

    it('should have storage config', () => {
      expect(defaultConfig.storage).toBeDefined();
      expect(defaultConfig.storage.type).toBeDefined();
      expect(defaultConfig.storage.path).toBeDefined();
      expect(defaultConfig.storage.maxSize).toBeDefined();
    });
  });
});
