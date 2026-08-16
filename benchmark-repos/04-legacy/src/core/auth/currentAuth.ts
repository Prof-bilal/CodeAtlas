// Current auth implementation for core modules
// This is essentially a copy of authV2.ts but adapted for core package
// TODO: figure out if we need both this and authV2.ts

import { createHmac, randomBytes } from 'crypto';
import { Database } from '../../database/connection';
import { Logger } from '../../utils';

export interface AuthConfig {
  secret: string;
  tokenTTL: number;
  refreshTTL: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
}

const DEFAULT_CONFIG: AuthConfig = {
  secret: process.env.AUTH_SECRET || 'dev-secret',
  tokenTTL: 15 * 60 * 1000,
  refreshTTL: 7 * 24 * 60 * 60 * 1000,
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000,
};

export class CoreAuthService {
  private db: Database;
  private config: AuthConfig;

  constructor(db: Database, config: Partial<AuthConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private hashPassword(password: string, salt: string): string {
    return createHmac('sha256', salt).update(password).digest('hex');
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  async login(email: string, password: string): Promise<{
    success: boolean;
    token?: string;
    error?: string;
  }> {
    const users = await this.db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    ) as any[];

    if (users.length === 0) {
      return { success: false, error: 'User not found' };
    }

    const user = users[0];
    const hash = this.hashPassword(password, user.salt);

    if (hash !== user.password_hash) {
      return { success: false, error: 'Invalid password' };
    }

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + this.config.tokenTTL);

    await this.db.query(
      'INSERT INTO core_sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt.toISOString()]
    );

    Logger.info(`Core auth login: ${user.email}`);

    return { success: true, token };
  }

  async validate(token: string): Promise<any | null> {
    const sessions = await this.db.query(
      `SELECT u.* FROM core_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > ?`,
      [token, new Date().toISOString()]
    ) as any[];

    return sessions.length > 0 ? sessions[0] : null;
  }

  // Duplicate of login but with different return type
  async authenticate(email: string, password: string): Promise<any> {
    const result = await this.login(email, password);
    if (!result.success) throw new Error(result.error);
    return { token: result.token };
  }
}
