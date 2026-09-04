// Auth v1 handler - DEPRECATED
// Used by mobile app v1 which is still active on some devices
// TODO: force upgrade mobile app to use v3

import { Request, Response } from 'express';
import { OldAuthService } from '../../../core/auth/oldAuth';
import { Database } from '../../../database/connection';

let authService: OldAuthService;

export function init(db: Database) {
  authService = new OldAuthService(db);
}

export async function handleLogin(req: Request, res: Response) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  const token = await authService.authenticate(username, password);

  if (!token) {
    return res.status(401).json({ error: 'Authentication failed' });
  }

  res.json({ token, version: 'v1' });
}

export async function handleValidate(req: Request, res: Response) {
  const token = req.headers['x-auth-token'] as string;

  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  const user = await authService.verify(token);

  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.json({ user });
}

export async function handleLogout(req: Request, res: Response) {
  const token = req.headers['x-auth-token'] as string;
  if (token) {
    await authService.invalidate(token);
  }
  res.json({ success: true });
}
