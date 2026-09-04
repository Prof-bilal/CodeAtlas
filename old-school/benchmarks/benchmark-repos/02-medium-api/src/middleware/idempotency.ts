import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface IdempotencyOptions {
  headerName?: string;
  ttlMs?: number;
}

const idempotencyStore = new Map<string, { response: any; statusCode: number; timestamp: number }>();

export function idempotencyMiddleware(options: IdempotencyOptions = {}) {
  const { headerName = 'x-idempotency-key', ttlMs = 24 * 60 * 60 * 1000 } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
      return next();
    }

    const idempotencyKey = req.headers[headerName] as string;
    
    if (!idempotencyKey) {
      return next();
    }

    const cached = idempotencyStore.get(idempotencyKey);
    
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      logger.info(`Idempotent request returned cached response: ${idempotencyKey}`);
      return res.status(cached.statusCode).json(cached.response);
    }

    const originalJson = res.json.bind(res);
    
    res.json = (body: any) => {
      idempotencyStore.set(idempotencyKey, {
        response: body,
        statusCode: res.statusCode,
        timestamp: Date.now(),
      });
      
      return originalJson(body);
    };

    next();
  };
}

export function cleanupIdempotencyStore(ttlMs: number = 24 * 60 * 60 * 1000): void {
  const now = Date.now();
  
  for (const [key, value] of idempotencyStore.entries()) {
    if (now - value.timestamp > ttlMs) {
      idempotencyStore.delete(key);
    }
  }
}

setInterval(() => cleanupIdempotencyStore(), 60 * 60 * 1000);
