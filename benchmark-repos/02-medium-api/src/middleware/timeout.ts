import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export function timeoutMiddleware(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn(`Request timeout: ${req.method} ${req.url}`);
        res.status(408).json({
          error: 'Request Timeout',
          message: 'The request took too long to process.',
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
}
