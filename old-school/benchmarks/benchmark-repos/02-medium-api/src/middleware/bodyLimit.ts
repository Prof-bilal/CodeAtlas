import { Request, Response, NextFunction } from 'express';

export interface RequestBodyLimitConfig {
  limit: string;
  type?: string;
}

export function requestBodyLimitMiddleware(config: RequestBodyLimitConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.headers['content-type'] || '';
    
    if (config.type && !contentType.includes(config.type)) {
      next();
      return;
    }
    
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const limit = parseSize(config.limit);
    
    if (contentLength > limit) {
      res.status(413).json({
        error: 'Request entity too large',
        limit: config.limit,
      });
      return;
    }
    
    next();
  };
}

function parseSize(size: string): number {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i);
  
  if (!match) {
    return 0;
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  return Math.floor(value * units[unit]);
}
