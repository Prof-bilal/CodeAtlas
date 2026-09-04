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

describe('Middleware Definitions', () => {
  it('should export authMiddleware', () => {
    expect(authMiddleware).toBeDefined();
  });

  it('should export adminMiddleware', () => {
    expect(adminMiddleware).toBeDefined();
  });

  it('should export roleMiddleware', () => {
    expect(roleMiddleware).toBeDefined();
  });

  it('should export createRateLimitMiddleware', () => {
    expect(createRateLimitMiddleware).toBeDefined();
  });

  it('should export globalRateLimit', () => {
    expect(globalRateLimit).toBeDefined();
  });

  it('should export authRateLimit', () => {
    expect(authRateLimit).toBeDefined();
  });

  it('should export apiRateLimit', () => {
    expect(apiRateLimit).toBeDefined();
  });

  it('should export correlationIdMiddleware', () => {
    expect(correlationIdMiddleware).toBeDefined();
  });

  it('should export requestLoggerMiddleware', () => {
    expect(requestLoggerMiddleware).toBeDefined();
  });

  it('should export metricsMiddleware', () => {
    expect(metricsMiddleware).toBeDefined();
  });

  it('should export timeoutMiddleware', () => {
    expect(timeoutMiddleware).toBeDefined();
  });

  it('should export idempotencyMiddleware', () => {
    expect(idempotencyMiddleware).toBeDefined();
  });

  it('should export cleanupIdempotencyStore', () => {
    expect(cleanupIdempotencyStore).toBeDefined();
  });

  it('should export compressionMiddleware', () => {
    expect(compressionMiddleware).toBeDefined();
  });

  it('should export cacheControlMiddleware', () => {
    expect(cacheControlMiddleware).toBeDefined();
  });

  it('should export noCacheMiddleware', () => {
    expect(noCacheMiddleware).toBeDefined();
  });

  it('should export versioningMiddleware', () => {
    expect(versioningMiddleware).toBeDefined();
  });

  it('should export requestIdMiddleware', () => {
    expect(requestIdMiddleware).toBeDefined();
  });

  it('should export errorHandler', () => {
    expect(errorHandler).toBeDefined();
  });

  it('should export notFoundHandler', () => {
    expect(notFoundHandler).toBeDefined();
  });

  it('should export asyncHandler', () => {
    expect(asyncHandler).toBeDefined();
  });

  it('should export HttpError', () => {
    expect(HttpError).toBeDefined();
  });

  it('should export createHttpError', () => {
    expect(createHttpError).toBeDefined();
  });
});
