import { Request, Response, NextFunction } from 'express';
import { RateLimiter } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

export function createRateLimitMiddleware(config: RateLimitConfig) {
  const limiter = new RateLimiter({
    windowMs: config.windowMs,
    max: config.max,
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const key = config.keyGenerator ? config.keyGenerator(req) : req.ip || 'unknown';
    
    const result = limiter.check(key);
    
    if (!result.allowed) {
      logger.warn(`Rate limit exceeded for ${key}`);
      return res.status(429).json({
        error: 'Too Many Requests',
        message: config.message || 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(result.resetTime / 1000),
      });
    }

    res.setHeader('X-RateLimit-Limit', config.max);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    next();
  };
}

export const globalRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

export const authRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts, please try again after 15 minutes',
});

export const apiRateLimit = createRateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many API requests, please try again after 1 minute',
});
