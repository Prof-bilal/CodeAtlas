import { describe, it, expect } from 'vitest';
import { createRateLimitMiddleware, globalRateLimit, authRateLimit, apiRateLimit } from '../src/middleware/rateLimit.js';

describe('Rate Limit Middleware', () => {
  it('should create rate limit middleware', () => {
    const middleware = createRateLimitMiddleware({
      windowMs: 60000,
      max: 100,
    });
    expect(middleware).toBeDefined();
  });

  it('should export global rate limit', () => {
    expect(globalRateLimit).toBeDefined();
  });

  it('should export auth rate limit', () => {
    expect(authRateLimit).toBeDefined();
  });

  it('should export api rate limit', () => {
    expect(apiRateLimit).toBeDefined();
  });
});
