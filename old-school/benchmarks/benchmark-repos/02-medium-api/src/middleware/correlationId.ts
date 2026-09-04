import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
  
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      correlationId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
    });
  });

  next();
}
