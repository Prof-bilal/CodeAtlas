import { Request, Response, NextFunction } from 'express';
import { AuthGuard, AuthContext } from '@atlas/auth';
import { RateLimiter } from '@atlas/shared';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'DashboardlistRoute' });
const rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 100 });

export interface RouteConfig20 {
  basePath: string;
  version: string;
  cache: { enabled: boolean; ttl: number };
  rateLimit: { enabled: boolean; maxRequests: number };
  validation: { enabled: boolean };
}

export class DashboardListRoute20 {
  private config: RouteConfig20;
  private authGuard: AuthGuard;

  constructor(authGuard: AuthGuard, config?: Partial<RouteConfig20>) {
    this.authGuard = authGuard;
    this.config = {
      basePath: '/api/v1/dashboard/list',
      version: 'v1',
      cache: { enabled: true, ttl: 300 },
      rateLimit: { enabled: true, maxRequests: 100 },
      validation: { enabled: true },
      ...config,
    };
  }

  async handle(req: Request, res: Response): Promise<void> {
    const requestId = Math.random().toString(36).substr(2, 9);
    const start = Date.now();
    try {
      logger.info('list Dashboard', { requestId, path: req.path });
      const tokenResult = this.authGuard.extractToken(req.headers.authorization);
      if (!tokenResult.ok) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const authResult = await this.authGuard.authenticate(tokenResult.value);
      if (!authResult.ok) { res.status(401).json({ error: 'Invalid token' }); return; }
      const rl = await rateLimiter.check(authResult.value.userId);
      if (!rl.allowed) { res.status(429).json({ error: 'Rate limited', retryAfter: rl.retryAfter }); return; }
      const data = await this.processList(req, authResult.value);
      res.json({ success: true, data, meta: { requestId, duration: Date.now() - start, version: this.config.version } });
    } catch (error) {
      logger.error('list failed', error as Error, { requestId });
      res.status(500).json({ error: 'Internal server error', requestId });
    }
  }

  private async processList(req: Request, ctx: AuthContext): Promise<unknown> {
    return { id: req.params.id, processed: true, timestamp: new Date().toISOString() };
  }
}