// Handler 41 - Route handler

import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils';

interface HandlerConfig41 {
  timeout: number;
  validateInput: boolean;
}

const defaultConfig41: HandlerConfig41 = {
  timeout: 5000,
  validateInput: true,
};

export class Handler41 {
  private config: HandlerConfig41;

  constructor(config: Partial<HandlerConfig41> = {}) {
    this.config = { ...defaultConfig41, ...config };
  }

  async handle(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    try {
      Logger.info(Handler 41:  );

      // Validate input if enabled
      if (this.config.validateInput) {
        const validation = this.validate(req);
        if (!validation.valid) {
          return res.status(400).json({ error: 'Validation failed', details: validation.errors });
        }
      }

      // Process request
      const result = await this.process(req);

      const duration = Date.now() - startTime;
      Logger.info(Handler 41: completed in ms);

      res.json({ success: true, data: result, duration });

    } catch (err: any) {
      Logger.error(Handler 41 error:, err);
      next(err);
    }
  }

  private validate(req: Request): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation
    if (!req.body && req.method !== 'GET') {
      errors.push('Request body is required');
    }

    return { valid: errors.length === 0, errors };
  }

  private async process(req: Request): Promise<any> {
    return {
      handler: 41,
      method: req.method,
      path: req.path,
      query: req.query,
      params: req.params,
      timestamp: new Date(),
    };
  }
}

export function handler41(req: Request, res: Response, next: NextFunction) {
  const h = new Handler41();
  h.handle(req, res, next);
}
