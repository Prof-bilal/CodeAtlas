// User manager - handles user lifecycle operations
// Different from UserService - this handles admin operations

import type { Database } from './database/connection';
import type { Redis } from './integrations/redis';
import { Logger } from './utils';

interface ManagedUser {
  id: string;
  email: string;
  username: string;
  status: 'active' | 'suspended' | 'deleted' | 'pending';
  role: string;
  createdAt: Date;
  lastActivityAt: Date | null;
}

export class UserManager {
  private db: Database;
  private redis: Redis;

  constructor(db: Database, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  async suspendUser(userId: string, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET status = 'suspended', suspension_reason = ?, suspended_at = ? WHERE id = ?`,
      [reason, new Date().toISOString(), userId]
    );

    // Invalidate all sessions
    await this.db.query('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await this.redis.del(`session:${userId}`);
    await this.redis.del(`user:${userId}`);

    Logger.warn(`User suspended: ${userId} - Reason: ${reason}`);
  }

  async reinstateUser(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET status = 'active', suspension_reason = NULL, suspended_at = NULL WHERE id = ?`,
      [userId]
    );

    await this.redis.del(`user:${userId}`);

    Logger.info(`User reinstated: ${userId}`);
  }

  async softDeleteUser(userId: string): Promise<void> {
    const timestamp = Date.now();
    const deletedEmail = `deleted_${timestamp}@removed.invalid`;
    const deletedUsername = `deleted_${timestamp}`;

    await this.db.query(
      `UPDATE users SET
         email = ?, username = ?, status = 'deleted',
         deleted_at = ?, password_hash = '', salt = ''
       WHERE id = ?`,
      [deletedEmail, deletedUsername, new Date().toISOString(), userId]
    );

    await this.db.query('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await this.redis.del(`user:${userId}`);

    Logger.warn(`User soft-deleted: ${userId}`);
  }

  async hardDeleteUser(userId: string): Promise<void> {
    // Delete related data
    await this.db.query('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await this.db.query('DELETE FROM payments WHERE user_id = ?', [userId]);
    await this.db.query('DELETE FROM notifications WHERE user_id = ?', [userId]);
    await this.db.query('DELETE FROM users WHERE id = ?', [userId]);

    await this.redis.del(`user:${userId}`);
    await this.redis.del(`session:${userId}`);

    Logger.warn(`User hard-deleted: ${userId}`);
  }

  async getUserActivity(userId: string): Promise<{
    lastLogin: Date | null;
    lastAction: Date | null;
    totalLogins: number;
    activeSessions: number;
  }> {
    const sessions = await this.db.query(
      'SELECT COUNT(*) as count FROM sessions WHERE user_id = ?',
      [userId]
    ) as any[];

    const user = await this.db.query(
      'SELECT last_login_at, last_activity_at, total_logins FROM users WHERE id = ?',
      [userId]
    ) as any[];

    if (user.length === 0) {
      return { lastLogin: null, lastAction: null, totalLogins: 0, activeSessions: 0 };
    }

    return {
      lastLogin: user[0].last_login_at ? new Date(user[0].last_login_at) : null,
      lastAction: user[0].last_activity_at ? new Date(user[0].last_activity_at) : null,
      totalLogins: user[0].total_logins || 0,
      activeSessions: sessions[0].count,
    };
  }

  async bulkUpdateRole(userIds: string[], role: string): Promise<number> {
    let updated = 0;
    for (const userId of userIds) {
      await this.db.query(
        'UPDATE users SET role = ?, updated_at = ? WHERE id = ?',
        [role, new Date().toISOString(), userId]
      );
      await this.redis.del(`user:${userId}`);
      updated++;
    }
    Logger.info(`Bulk role update: ${updated} users set to ${role}`);
    return updated;
  }

  async exportUserData(userId: string): Promise<Record<string, any>> {
    const user = await this.db.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    ) as any[];

    const payments = await this.db.query(
      'SELECT * FROM payments WHERE user_id = ?',
      [userId]
    ) as any[];

    const sessions = await this.db.query(
      'SELECT * FROM sessions WHERE user_id = ?',
      [userId]
    ) as any[];

    return {
      user: user[0] || null,
      payments,
      sessions,
      exportedAt: new Date().toISOString(),
    };
  }
}
