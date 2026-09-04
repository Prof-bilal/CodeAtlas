import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

export interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
}

export function cacheMiddleware(options: CacheOptions = {}) {
  const cache = new Map<string, { value: any; expiresAt: number }>();
  const ttl = options.ttl || 60000;
  
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET') {
      next();
      return;
    }
    
    const key = options.keyGenerator 
      ? options.keyGenerator(req)
      : generateCacheKey(req);
    
    const cached = cache.get(key);
    
    if (cached && Date.now() < cached.expiresAt) {
      res.json(cached.value);
      return;
    }
    
    const originalJson = res.json.bind(res);
    
    res.json = (body: any) => {
      cache.set(key, {
        value: body,
        expiresAt: Date.now() + ttl,
      });
      
      return originalJson(body);
    };
    
    next();
  };
}

function generateCacheKey(req: Request): string {
  const data = `${req.method}:${req.originalUrl}:${JSON.stringify(req.query)}`;
  return createHash('md5').update(data).digest('hex');
}

export function clearCache(pattern?: string): void {
  if (pattern) {
    const regex = new RegExp(pattern);
    for (const key of cache.keys()) {
      if (regex.test(key)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

const cache = new Map<string, { value: any; expiresAt: number }>();
