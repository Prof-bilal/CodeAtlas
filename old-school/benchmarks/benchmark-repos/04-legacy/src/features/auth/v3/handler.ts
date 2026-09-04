// Auth v3 handler - CURRENT IMPLEMENTATION
// This is the active auth handler. All new clients should use this.

import { Request, Response, NextFunction } from 'express';
import { AuthServiceV2 } from '../../../authV2';
import { Database } from '../../../database/connection';
import { Redis } from '../../../integrations/redis';
import { Logger } from '../../../utils';
import { RateLimiter } from '../../../middleware/rateLimiter';
import { validateEmail, validatePassword } from '../../../validators/auth';

let authService: AuthServiceV2;
let rateLimiter: RateLimiter;

export function initAuthV3(db: Database, redis: Redis) {
  authService = new AuthServiceV2(db, redis);
  rateLimiter = new RateLimiter(redis, { windowMs: 60000, max: 10 });
}

export async function handleRegister(req: Request, res: Response) {
  const { email, username, password } = req.body;

  const emailError = validateEmail(email);
  if (emailError) {
    return res.status(400).json({ error: emailError, code: 'INVALID_EMAIL' });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError, code: 'INVALID_PASSWORD' });
  }

  if (!username || username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters', code: 'INVALID_USERNAME' });
  }

  try {
    const result = await authService.register(email, username, password);

    if (!result.success) {
      return res.status(409).json({ error: result.error, code: 'REGISTRATION_FAILED' });
    }

    Logger.info(`New registration: ${username} (${email})`);

    res.status(201).json({
      success: true,
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    Logger.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed', code: 'INTERNAL_ERROR' });
  }
}

export async function handleLogin(req: Request, res: Response) {
  const { email, password } = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Rate limiting
  const limited = await rateLimiter.check(ipAddress);
  if (limited) {
    return res.status(429).json({ error: 'Too many attempts', code: 'RATE_LIMITED' });
  }

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required', code: 'MISSING_CREDENTIALS' });
  }

  try {
    const result = await authService.login(email, password, ipAddress, userAgent);

    if (!result.success) {
      if (result.mfaRequired) {
        return res.status(200).json({ mfaRequired: true, code: 'MFA_REQUIRED' });
      }
      return res.status(401).json({ error: result.error, code: 'AUTH_FAILED' });
    }

    res.json({
      success: true,
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    Logger.error('Login error:', err);
    res.status(500).json({ error: 'Login failed', code: 'INTERNAL_ERROR' });
  }
}

export async function handleRefreshToken(req: Request, res: Response) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required', code: 'MISSING_REFRESH_TOKEN' });
  }

  const result = await authService.refreshToken(refreshToken);

  if (!result.success) {
    return res.status(401).json({ error: result.error, code: 'INVALID_REFRESH_TOKEN' });
  }

  res.json({
    success: true,
    token: result.token,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
  });
}

export async function handleLogout(req: Request, res: Response) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    await authService.logout(token);
  }

  res.json({ success: true });
}

export async function handleValidate(req: Request, res: Response) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided', code: 'NO_TOKEN' });
  }

  const user = await authService.validateToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }

  const { passwordHash, salt, mfaSecret, ...safeUser } = user as any;
  res.json({ user: safeUser });
}

// Auth middleware for protected routes
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await authService.validateToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  (req as any).user = user;
  next();
}
