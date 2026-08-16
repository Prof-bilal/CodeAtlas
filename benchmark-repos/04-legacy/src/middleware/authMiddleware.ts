// Auth middleware - OLD version
// DEPRECATED 2024-01

import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../auth';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  const user = await validateToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  (req as any).user = user;
  next();
}
