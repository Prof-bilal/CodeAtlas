// Auth v2 handler - DEPRECATED as of 2024-02
// Mobile app v2 uses this but should migrate to v3
// DO NOT ADD NEW FEATURES HERE

import { Request, Response } from 'express';
import { CoreAuthService } from '../../../core/auth/currentAuth';
import { Database } from '../../../database/connection';

let authService: CoreAuthService;

export function initAuthV2(db: Database) {
  authService = new CoreAuthService(db);
}

export async function loginV2(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password required',
      code: 'MISSING_CREDENTIALS',
    });
  }

  try {
    const result = await authService.login(email, password);

    if (!result.success) {
      return res.status(401).json({
        error: result.error,
        code: 'AUTH_FAILED',
      });
    }

    res.json({
      success: true,
      token: result.token,
      expiresIn: 900, // 15 minutes in seconds
    });
  } catch (err) {
    console.error('V2 login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function validateV2(req: Request, res: Response) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided', code: 'NO_TOKEN' });
  }

  const user = await authService.validate(token);

  if (!user) {
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }

  res.json({ user });
}

// V2 had a different response format than v3
export function formatV2Response(data: any) {
  return {
    status: data.error ? 'error' : 'ok',
    data: data.user || null,
    message: data.error || 'success',
  };
}
