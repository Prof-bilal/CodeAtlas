import { describe, it, expect } from 'vitest';
import { authMiddleware, adminMiddleware, roleMiddleware } from '../src/middleware/auth.js';
import { createRateLimitMiddleware, globalRateLimit, authRateLimit, apiRateLimit } from '../src/middleware/rateLimit.js';
import { correlationIdMiddleware } from '../src/middleware/correlationId.js';
import { requestLoggerMiddleware } from '../src/middleware/requestLogger.js';
import { metricsMiddleware } from '../src/middleware/metrics.js';
import { timeoutMiddleware } from '../src/middleware/timeout.js';
import { idempotencyMiddleware, cleanupIdempotencyStore } from '../src/middleware/idempotency.js';
import { compressionMiddleware } from '../src/middleware/compression.js';
import { cacheControlMiddleware, noCacheMiddleware } from '../src/middleware/cacheControl.js';
import { versioningMiddleware } from '../src/middleware/versioning.js';
import { requestIdMiddleware } from '../src/middleware/requestId.js';
import { errorHandler, notFoundHandler, asyncHandler, HttpError, createHttpError } from '../src/middleware/errorHandler.js';

describe('Middleware Layer', () => {
  describe('Auth Middleware', () => {
    it('should be defined', () => { expect(authMiddleware).toBeDefined(); });
    it('should be a function', () => { expect(typeof authMiddleware).toBe('function'); });
  });

  describe('Admin Middleware', () => {
    it('should be defined', () => { expect(adminMiddleware).toBeDefined(); });
    it('should be a function', () => { expect(typeof adminMiddleware).toBe('function'); });
  });

  describe('Role Middleware', () => {
    it('should be defined', () => { expect(roleMiddleware).toBeDefined(); });
    it('should be a function', () => { expect(typeof roleMiddleware).toBe('function'); });
  });

  describe('Rate Limit Middleware', () => {
    it('should export createRateLimitMiddleware', () => { expect(createRateLimitMiddleware).toBeDefined(); });
    it('should export globalRateLimit', () => { expect(globalRateLimit).toBeDefined(); });
    it('should export authRateLimit', () => { expect(authRateLimit).toBeDefined(); });
    it('should export apiRateLimit', () => { expect(apiRateLimit).toBeDefined(); });
  });

  describe('Correlation ID Middleware', () => {
    it('should be defined', () => { expect(correlationIdMiddleware).toBeDefined(); });
    it('should be a function', () => { expect(typeof correlationIdMiddleware).toBe('function'); });
  });

  describe('Request Logger Middleware', () => {
    it('should be defined', () => { expect(requestLoggerMiddleware).toBeDefined(); });
    it('should be a function', () => { expect(typeof requestLoggerMiddleware).toBe('function'); });
  });

  describe('Metrics Middleware', () => {
    it('should be defined', () => { expect(metricsMiddleware).toBeDefined(); });
    it('should be a function', () => { expect(typeof metricsMiddleware).toBe('function'); });
  });

  describe('Timeout Middleware', () => {
    it('should export timeoutMiddleware', () => { expect(timeoutMiddleware).toBeDefined(); });
    it('should be a function', () => { expect(typeof timeoutMiddleware).toBe('function'); });
  });

  describe('Idempotency Middleware', () => {
    it('should export idempotencyMiddleware', () => { expect(idempotencyMiddleware).toBeDefined(); });
    it('should export cleanupIdempotencyStore', () => { expect(cleanupIdempotencyStore).toBeDefined(); });
  });

  describe('Compression Middleware', () => {
    it('should export compressionMiddleware', () => { expect(compressionMiddleware).toBeDefined(); });
  });

  describe('Cache Control Middleware', () => {
    it('should export cacheControlMiddleware', () => { expect(cacheControlMiddleware).toBeDefined(); });
    it('should export noCacheMiddleware', () => { expect(noCacheMiddleware).toBeDefined(); });
  });

  describe('Versioning Middleware', () => {
    it('should be defined', () => { expect(versioningMiddleware).toBeDefined(); });
    it('should be a function', () => { expect(typeof versioningMiddleware).toBe('function'); });
  });

  describe('Request ID Middleware', () => {
    it('should be defined', () => { expect(requestIdMiddleware).toBeDefined(); });
    it('should be a function', () => { expect(typeof requestIdMiddleware).toBe('function'); });
  });

  describe('Error Handler Middleware', () => {
    it('should export errorHandler', () => { expect(errorHandler).toBeDefined(); });
    it('should export notFoundHandler', () => { expect(notFoundHandler).toBeDefined(); });
    it('should export asyncHandler', () => { expect(asyncHandler).toBeDefined(); });
    it('should export HttpError', () => { expect(HttpError).toBeDefined(); });
    it('should export createHttpError', () => { expect(createHttpError).toBeDefined(); });
  });
});
