// Rate limiter middleware
// DEPRECATED - use the one in src/middleware/rateLimiter.ts

import { Request, Response, NextFunction } from 'express';

const requests = new Map<string, { count: number; resetAt: number }>();

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 100;

  const record = requests.get(ip) || { count: 0, resetAt: now + windowMs };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }

  record.count++;
  requests.set(ip, record);

  if (record.count > maxRequests) {
    return res.status(429).json({ error: 'Rate limited' });
  }

  next();
}
