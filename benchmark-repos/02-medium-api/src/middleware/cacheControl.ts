import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface CacheControlOptions {
  maxAge?: number;
  private?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  mustRevalidate?: boolean;
}

export function cacheControlMiddleware(options: CacheControlOptions = {}) {
  const {
    maxAge = 0,
    private: isPrivate = true,
    noCache = false,
    noStore = false,
    mustRevalidate = false,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const directives: string[] = [];
    
    if (isPrivate) directives.push('private');
    if (noCache) directives.push('no-cache');
    if (noStore) directives.push('no-store');
    if (mustRevalidate) directives.push('must-revalidate');
    
    if (!noStore && !noCache) {
      directives.push(`max-age=${maxAge}`);
    }

    res.setHeader('Cache-Control', directives.join(', '));
    next();
  };
}

export const noCacheMiddleware = cacheControlMiddleware({
  noCache: true,
  mustRevalidate: true,
  maxAge: 0,
});

export function setCacheHeaders(res: Response, maxAge: number): void {
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  res.setHeader('ETag', `"${Date.now()}"`);
}
