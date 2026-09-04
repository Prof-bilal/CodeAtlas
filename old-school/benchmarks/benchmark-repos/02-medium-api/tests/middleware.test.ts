import { describe, it, expect } from 'vitest';
import { correlationIdMiddleware } from '../src/middleware/correlationId.js';
import { requestLoggerMiddleware } from '../src/middleware/requestLogger.js';
import { metricsMiddleware } from '../src/middleware/metrics.js';
import { timeoutMiddleware } from '../src/middleware/timeout.js';
import { idempotencyMiddleware, cleanupIdempotencyStore } from '../src/middleware/idempotency.js';
import { compressionMiddleware } from '../src/middleware/compression.js';
import { cacheControlMiddleware, noCacheMiddleware } from '../src/middleware/cacheControl.js';
import { versioningMiddleware } from '../src/middleware/versioning.js';
import { requestIdMiddleware } from '../src/middleware/requestId.js';

describe('Middleware', () => {
  describe('correlationIdMiddleware', () => {
    it('should be defined', () => {
      expect(correlationIdMiddleware).toBeDefined();
    });
  });

  describe('requestLoggerMiddleware', () => {
    it('should be defined', () => {
      expect(requestLoggerMiddleware).toBeDefined();
    });
  });

  describe('metricsMiddleware', () => {
    it('should be defined', () => {
      expect(metricsMiddleware).toBeDefined();
    });
  });

  describe('timeoutMiddleware', () => {
    it('should create timeout middleware', () => {
      const middleware = timeoutMiddleware(5000);
      expect(middleware).toBeDefined();
    });
  });

  describe('idempotencyMiddleware', () => {
    it('should create idempotency middleware', () => {
      const middleware = idempotencyMiddleware();
      expect(middleware).toBeDefined();
    });

    it('should cleanup store', () => {
      cleanupIdempotencyStore();
    });
  });

  describe('compressionMiddleware', () => {
    it('should create compression middleware', () => {
      const middleware = compressionMiddleware();
      expect(middleware).toBeDefined();
    });
  });

  describe('cacheControlMiddleware', () => {
    it('should create cache control middleware', () => {
      const middleware = cacheControlMiddleware({ maxAge: 3600 });
      expect(middleware).toBeDefined();
    });

    it('should export no cache middleware', () => {
      expect(noCacheMiddleware).toBeDefined();
    });
  });

  describe('versioningMiddleware', () => {
    it('should be defined', () => {
      expect(versioningMiddleware).toBeDefined();
    });
  });

  describe('requestIdMiddleware', () => {
    it('should be defined', () => {
      expect(requestIdMiddleware).toBeDefined();
    });
  });
});
