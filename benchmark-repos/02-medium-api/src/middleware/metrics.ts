import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { metricsCollector } from '../utils/metrics.js';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  metricsCollector.recordRequest();
  metricsCollector.incrementConnections();

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    metricsCollector.decrementConnections();
    metricsCollector.recordResponseTime(duration);

    if (res.statusCode >= 400) {
      metricsCollector.recordError();
    }
  });

  next();
}
