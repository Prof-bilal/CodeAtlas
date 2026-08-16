// CURRENT AUTH IMPLEMENTATION - v2.3.1
// This is the active auth system. All new code should use this.
// Last updated: 2024-03-20

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Database } from './database/connection';
import { Logger } from './utils';
import { Redis } from './integrations/redis';

interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: 'admin' | 'user' | 'viewer';
  mfaEnabled: boolean;
  mfaSecret?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  createdAt: Date;
}

interface AuthResult {
  success: boolean;
  user?: Omit<User, 'passwordHash' | 'salt' | 'mfaSecret'>;
  token?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: string;
  mfaRequired?: boolean;
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'fallback-refresh-secret';
const ACCESS_TOKEN_TTL = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

export class AuthServiceV2 {
  private db: Database;
  private redis: Redis;
  private loginAttempts: Map<string, { count: number; lockedUntil?: Date }> = new Map();

  constructor(db: Database, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  private hashPassword(password: string, salt: string): string {
    return createHmac('sha256', salt).update(password).digest('hex');
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  async register(
    email: string,
    username: string,
    password: string
  ): Promise<AuthResult> {
    const existing = await this.db.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if ((existing as any[]).length > 0) {
      return { success: false, error: 'Email or username already exists' };
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(password, salt);
    const id = this.generateId();

    await this.db.query(
      `INSERT INTO users (id, email, username, password_hash, salt, role, mfa_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'user', false, ?, ?)`,
      [id, email, username, passwordHash, salt, new Date().toISOString(), new Date().toISOString()]
    );

    Logger.info(`New user registered: ${username} (${email})`);

    return this.login(email, password, '', '');
  }

  async login(
    emailOrUsername: string,
    password: string,
    ipAddress: string,
    userAgent: string
  ): Promise<AuthResult> {
    const attempts = this.loginAttempts.get(emailOrUsername);
    if (attempts?.lockedUntil && attempts.lockedUntil > new Date()) {
      return {
        success: false,
        error: `Account locked. Try again after ${attempts.lockedUntil.toISOString()}`
      };
    }

    const users = await this.db.query(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [emailOrUsername, emailOrUsername]
    ) as User[];

    if (users.length === 0) {
      this.recordFailedAttempt(emailOrUsername);
      return { success: false, error: 'Invalid credentials' };
    }

    const user = users[0];
    const hash = this.hashPassword(password, user.salt);

    if (!timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash))) {
      this.recordFailedAttempt(emailOrUsername);
      return { success: false, error: 'Invalid credentials' };
    }

    if (user.mfaEnabled) {
      return {
        success: false,
        mfaRequired: true,
        error: 'MFA verification required'
      };
    }

    this.loginAttempts.delete(emailOrUsername);

    const token = this.generateToken();
    const refreshToken = this.generateToken();
    const sessionId = this.generateId();
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL);

    const session: Session = {
      id: sessionId,
      userId: user.id,
      token,
      refreshToken,
      ipAddress,
      userAgent,
      expiresAt,
      createdAt: new Date(),
    };

    await this.db.query(
      `INSERT INTO sessions (id, user_id, token, refresh_token, ip_address, user_agent, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [session.id, session.userId, session.token, session.refreshToken,
       session.ipAddress, session.userAgent, session.expiresAt.toISOString(),
       session.createdAt.toISOString()]
    );

    await this.redis.setex(`session:${user.id}`, 900, JSON.stringify(session));

    await this.db.query(
      'UPDATE users SET last_login_at = ? WHERE id = ?',
      [new Date().toISOString(), user.id]
    );

    Logger.info(`User logged in: ${user.username} from ${ipAddress}`);

    const { passwordHash, salt, mfaSecret, ...safeUser } = user;
    return {
      success: true,
      user: safeUser,
      token,
      refreshToken,
      expiresAt,
    };
  }

  async validateToken(token: string): Promise<User | null> {
    const cached = await this.redis.get(`token:${token}`);
    if (cached) {
      return JSON.parse(cached) as User;
    }

    const sessions = await this.db.query(
      `SELECT s.*, u.* FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > ?`,
      [token, new Date().toISOString()]
    ) as any[];

    if (sessions.length === 0) return null;

    const user = sessions[0] as User;
    await this.redis.setex(`token:${token}`, 900, JSON.stringify(user));

    return user;
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    const sessions = await this.db.query(
      `SELECT * FROM sessions WHERE refresh_token = ?`,
      [refreshToken]
    ) as Session[];

    if (sessions.length === 0) {
      return { success: false, error: 'Invalid refresh token' };
    }

    const session = sessions[0];
    const newToken = this.generateToken();
    const newRefreshToken = this.generateToken();
    const newExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL);

    await this.db.query(
      'UPDATE sessions SET token = ?, refresh_token = ?, expires_at = ? WHERE id = ?',
      [newToken, newRefreshToken, newExpiresAt.toISOString(), session.id]
    );

    await this.redis.del(`session:${session.userId}`);
    await this.redis.del(`token:${session.token}`);

    Logger.info(`Token refreshed for user ${session.userId}`);

    return {
      success: true,
      token: newToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
    };
  }

  async logout(token: string): Promise<void> {
    const sessions = await this.db.query(
      'SELECT * FROM sessions WHERE token = ?',
      [token]
    ) as Session[];

    if (sessions.length > 0) {
      await this.redis.del(`session:${sessions[0].userId}`);
      await this.redis.del(`token:${token}`);
      await this.db.query('DELETE FROM sessions WHERE id = ?', [sessions[0].id]);
      Logger.info(`User logged out: ${sessions[0].userId}`);
    }
  }

  private recordFailedAttempt(identifier: string): void {
    const current = this.loginAttempts.get(identifier) || { count: 0 };
    current.count++;

    if (current.count >= MAX_LOGIN_ATTEMPTS) {
      current.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
      Logger.warn(`Account locked: ${identifier} after ${MAX_LOGIN_ATTEMPTS} failed attempts`);
    }

    this.loginAttempts.set(identifier, current);
  }
}
