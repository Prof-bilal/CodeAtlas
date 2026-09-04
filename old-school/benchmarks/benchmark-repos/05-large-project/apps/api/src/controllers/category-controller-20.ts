import { Request, Response, NextFunction } from 'express';
import { AuthGuard, AuthContext } from '@atlas/auth';
import { Logger, Result, Ok, Err } from '@atlas/shared';

const logger = new Logger({ context: 'CategoryController20' });

export class CategoryController20 {
  constructor(private authGuard: AuthGuard) {}

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = Math.random().toString(36).substr(2, 9);
    const start = Date.now();
    try {
      const tokenResult = this.authGuard.extractToken(req.headers.authorization);
      if (!tokenResult.ok) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const authResult = await this.authGuard.authenticate(tokenResult.value);
      if (!authResult.ok) { res.status(401).json({ error: 'Invalid token' }); return; }
      const result = await this.handleGet(req, authResult.value);
      res.json({ success: true, data: result, meta: { requestId, duration: Date.now() - start } });
    } catch (error) {
      logger.error('GET failed', error as Error, { requestId });
      res.status(500).json({ error: 'Internal server error', requestId });
    }
  }

  private async handleGet(req: Request, ctx: AuthContext): Promise<unknown> {
    return { entity: 'Category', method: 'GET', processed: true };
  }
}