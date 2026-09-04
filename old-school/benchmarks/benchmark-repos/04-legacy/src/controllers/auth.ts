// Auth controller - OLD
// DEPRECATED

import { Request, Response } from 'express';
import { login, hashPassword } from '../auth';

export async function handleLogin(req: Request, res: Response) {
  const { username, password } = req.body;
  const session = await login(username, password);
  if (!session) return res.status(401).json({ error: 'Failed' });
  res.json(session);
}

export async function handleRegister(req: Request, res: Response) {
  const { username, email, password } = req.body;
  const hashed = hashPassword(password);
  // ... register logic
  res.status(201).json({ success: true });
}
