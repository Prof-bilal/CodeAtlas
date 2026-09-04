import { Request, Response, NextFunction } from 'express';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'helmet16' });

interface Config16 { enabled: boolean; options: Record<string, unknown>; }

export function helmet16(config?: Partial<Config16>) {
  const cfg: Config16 = { enabled: true, options: {}, ...config };
  return (req: Request, res: Response, next: NextFunction) => {
    if (!cfg.enabled) { next(); return; }
    const start = Date.now();
    const requestId = (req as any).requestId ?? Math.random().toString(36).substr(2, 9);
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    logger.debug('helmet processing', { requestId, method: req.method, path: req.path });
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const duration = Date.now() - start;
      logger.debug('helmet completed', { requestId, duration, statusCode: res.statusCode });
      return originalEnd.apply(this, args as any);
    } as any;
    next();
  };
}