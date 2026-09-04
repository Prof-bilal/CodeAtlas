// Wrapper around old auth - used by admin panel only
// TODO: remove this file when admin panel is migrated to v2

import { login as oldLogin, validateToken as oldValidate, hashPassword } from './auth';
import { Logger } from './utils';
import type { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

export async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const user = await oldValidate(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    next();
  } catch (err) {
    Logger.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Auth failed' });
  }
}

export async function loginUser(username: string, password: string) {
  return oldLogin(username, password);
}

// Duplicate of hashPassword from auth.ts but with logging
export function hashUserPassword(password: string): string {
  Logger.info('Hashing password (legacy wrapper)');
  return hashPassword(password);
}
