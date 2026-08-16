// Session middleware
// OLD implementation - uses memory store

import type { Request, Response, NextFunction } from 'express';

const sessions = new Map<string, any>();

export function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.headers['x-session-id'] as string;

  if (sessionId && sessions.has(sessionId)) {
    (req as any).session = sessions.get(sessionId);
  } else {
    const newId = Math.random().toString(36).substring(2);
    sessions.set(newId, {});
    (req as any).session = {};
    res.setHeader('X-Session-Id', newId);
  }

  next();
}
