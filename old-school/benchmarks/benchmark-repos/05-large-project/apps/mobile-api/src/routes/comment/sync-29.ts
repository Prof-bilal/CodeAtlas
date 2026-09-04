import type { Request, Response } from 'express';
import type { AuthGuard } from '@atlas/auth';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'MobileCommentsync29' });

export class MobileCommentSync29 {
  constructor(private authGuard: AuthGuard) {}

  async handle(req: Request, res: Response): Promise<void> {
    const requestId = Math.random().toString(36).substr(2, 9);
    const start = Date.now();
    try {
      logger.info('Mobile sync', { requestId, platform: req.headers['x-platform'] });
      const tokenResult = this.authGuard.extractToken(req.headers.authorization);
      if (!tokenResult.ok) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const authResult = await this.authGuard.authenticate(tokenResult.value);
      if (!authResult.ok) { res.status(401).json({ error: 'Invalid token' }); return; }
      const data = await this.processSync(req);
      res.json({ success: true, data, meta: { requestId, duration: Date.now() - start, platform: req.headers['x-platform'] } });
    } catch (error) {
      logger.error('Failed', error as Error, { requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async processSync(req: Request): Promise<unknown> {
    return { entity: 'Comment', endpoint: 'sync', platform: req.headers['x-platform'] };
  }
}