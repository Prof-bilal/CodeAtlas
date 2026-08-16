import { Request, Response, NextFunction } from 'express';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'requestId28' });

interface Config28 { enabled: boolean; options: Record<string, unknown>; }

export function requestId28(config?: Partial<Config28>) {
  const cfg: Config28 = { enabled: true, options: {}, ...config };
  return (req: Request, res: Response, next: NextFunction) => {
    if (!cfg.enabled) { next(); return; }
    const start = Date.now();
    const requestId = (req as any).requestId ?? Math.random().toString(36).substr(2, 9);
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    logger.debug('requestId processing', { requestId, method: req.method, path: req.path });
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const duration = Date.now() - start;
      logger.debug('requestId completed', { requestId, duration, statusCode: res.statusCode });
      return originalEnd.apply(this, args as any);
    } as any;
    next();
  };
}