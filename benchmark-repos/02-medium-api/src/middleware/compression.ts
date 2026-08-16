import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface CompressionOptions {
  threshold?: number;
  level?: number;
}

export function compressionMiddleware(options: CompressionOptions = {}) {
  const { threshold = 1024 } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const acceptEncoding = req.get('Accept-Encoding') || '';
    
    if (!acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate')) {
      return next();
    }

    const originalJson = res.json.bind(res);
    
    res.json = (body: any) => {
      const content = JSON.stringify(body);
      
      if (content.length < threshold) {
        return originalJson(body);
      }

      const encoding = acceptEncoding.includes('gzip') ? 'gzip' : 'deflate';
      
      res.setHeader('Content-Encoding', encoding);
      res.removeHeader('Content-Length');

      return originalJson(body);
    };

    next();
  };
}
