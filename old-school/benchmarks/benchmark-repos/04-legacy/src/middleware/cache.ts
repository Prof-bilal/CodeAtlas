// Cache middleware
// OLD implementation

import { Request, Response, NextFunction } from 'express';

const cache = new Map<string, { data: any; expiry: number }>();

export function cacheMiddleware(ttl: number = 300) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();

    const key = req.url;
    const cached = cache.get(key);

    if (cached && cached.expiry > Date.now()) {
      return res.json(cached.data);
    }

    const originalJson = res.json.bind(res);
    res.json = (data: any) => {
      cache.set(key, { data, expiry: Date.now() + ttl * 1000 });
      return originalJson(data);
    };

    next();
  };
}
