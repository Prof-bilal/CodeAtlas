// DO NOT USE - This was the original core auth module
// Replaced by authV2.ts in the root src/ directory
// Kept for backward compatibility with legacy API routes

import { createHash } from 'crypto';
import { Database } from '../../database/connection';

interface LegacyUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

const SESSION_STORE: Map<string, LegacyUser> = new Map();

export class OldAuthService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async authenticate(username: string, password: string): Promise<string | null> {
    const hash = createHash('sha1').update(password).digest('hex');

    const result = await this.db.query(
      'SELECT id, username, email, role FROM users WHERE username = ? AND password = ?',
      [username, hash]
    ) as LegacyUser[];

    if (result.length === 0) return null;

    const token = createHash('sha1')
      .update(`${result[0].id}-${Date.now()}`)
      .digest('hex');

    SESSION_STORE.set(token, result[0]);
    return token;
  }

  async verify(token: string): Promise<LegacyUser | null> {
    return SESSION_STORE.get(token) || null;
  }

  async invalidate(token: string): Promise<void> {
    SESSION_STORE.delete(token);
  }

  // Used by legacy mobile app
  async authenticateWithDeviceId(deviceId: string): Promise<string | null> {
    const result = await this.db.query(
      'SELECT id, username, email, role FROM users WHERE device_id = ?',
      [deviceId]
    ) as LegacyUser[];

    if (result.length === 0) return null;

    const token = `device-${createHash('sha1').update(deviceId).digest('hex')}`;
    SESSION_STORE.set(token, result[0]);
    return token;
  }
}
