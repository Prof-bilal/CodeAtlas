// User service - class-based
// CURRENT implementation for user management
// Last updated: 2024-03-01

import type { Database } from './database/connection';
import type { Redis } from './integrations/redis';
import { Logger } from './utils';
import { createHmac, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  role: 'admin' | 'user' | 'viewer';
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
}

export class UserService {
  private db: Database;
  private redis: Redis;

  constructor(db: Database, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const cached = await this.redis.get(`user:${userId}`);
    if (cached) return JSON.parse(cached) as UserProfile;

    const results = await this.db.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    ) as any[];

    if (results.length === 0) return null;

    const profile = this.mapRow(results[0]);
    await this.redis.setex(`user:${userId}`, 300, JSON.stringify(profile));

    return profile;
  }

  async getProfileByEmail(email: string): Promise<UserProfile | null> {
    const results = await this.db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    ) as any[];

    return results.length > 0 ? this.mapRow(results[0]) : null;
  }

  async getProfileByUsername(username: string): Promise<UserProfile | null> {
    const results = await this.db.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    ) as any[];

    return results.length > 0 ? this.mapRow(results[0]) : null;
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
    const existing = await this.getProfile(userId);
    if (!existing) throw new Error('User not found');

    const updates: string[] = [];
    const values: any[] = [];

    if (input.displayName !== undefined) {
      updates.push('display_name = ?');
      values.push(input.displayName);
    }
    if (input.avatarUrl !== undefined) {
      updates.push('avatar_url = ?');
      values.push(input.avatarUrl);
    }
    if (input.bio !== undefined) {
      updates.push('bio = ?');
      values.push(input.bio);
    }

    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(userId);

    await this.db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    await this.redis.del(`user:${userId}`);

    Logger.info(`User profile updated: ${userId}`);

    return (await this.getProfile(userId))!;
  }

  async searchUsers(query: string, limit: number = 20): Promise<UserProfile[]> {
    const results = await this.db.query(
      `SELECT * FROM users
       WHERE username LIKE ? OR display_name LIKE ? OR email LIKE ?
       LIMIT ?`,
      [`%${query}%`, `%${query}%`, `%${query}%`, limit]
    ) as any[];

    return results.map(this.mapRow);
  }

  async getUsersByRole(role: string): Promise<UserProfile[]> {
    const results = await this.db.query(
      'SELECT * FROM users WHERE role = ? ORDER BY created_at DESC',
      [role]
    ) as any[];

    return results.map(this.mapRow);
  }

  async getStats(): Promise<UserStats> {
    const results = await this.db.query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN last_login_at > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as active,
         SUM(CASE WHEN created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as new_month
       FROM users`
    ) as any[];

    return {
      totalUsers: results[0].total,
      activeUsers: results[0].active,
      newUsersThisMonth: results[0].new_month,
    };
  }

  async deactivateUser(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE users SET role = ?, updated_at = ? WHERE id = ?',
      ['deactivated', new Date().toISOString(), userId]
    );
    await this.redis.del(`user:${userId}`);
    Logger.info(`User deactivated: ${userId}`);
  }

  async reactivateUser(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE users SET role = ?, updated_at = ? WHERE id = ?',
      ['user', new Date().toISOString(), userId]
    );
    await this.redis.del(`user:${userId}`);
    Logger.info(`User reactivated: ${userId}`);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.query('DELETE FROM users WHERE id = ?', [userId]);
    await this.redis.del(`user:${userId}`);
    Logger.warn(`User deleted: ${userId}`);
  }

  private mapRow(row: any): UserProfile {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarUrl: row.avatar_url,
      bio: row.bio || '',
      role: row.role,
      emailVerified: row.email_verified || false,
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
