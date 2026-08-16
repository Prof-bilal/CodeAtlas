import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../database/databaseService.js';
import { logger } from '../utils/logger.js';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message?: string;
  read: boolean;
  data?: any;
  createdAt: Date;
}

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message?: string;
  data?: any;
}

export class NotificationRepository {
  async findById(id: string): Promise<Notification | null> {
    const result = await databaseService.query<Notification>(
      'SELECT * FROM notifications WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async create(input: CreateNotificationInput): Promise<Notification> {
    const id = uuidv4();
    const result = await databaseService.query<Notification>(
      `INSERT INTO notifications (id, user_id, type, title, message, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, input.userId, input.type, input.title, input.message, input.data ? JSON.stringify(input.data) : null]
    );
    return result.rows[0];
  }

  async markAsRead(id: string): Promise<Notification | null> {
    const result = await databaseService.query<Notification>(
      'UPDATE notifications SET read = true WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0] || null;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await databaseService.query(
      'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
      [userId]
    );
    return result.rowCount ?? 0;
  }

  async findByUserId(userId: string, options?: { unreadOnly?: boolean; limit?: number; offset?: number }): Promise<Notification[]> {
    let query = 'SELECT * FROM notifications WHERE user_id = $1';
    const params: any[] = [userId];

    if (options?.unreadOnly) {
      query += ' AND read = false';
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await databaseService.query<Notification>(query, params);
    return result.rows;
  }

  async countUnread(userId: string): Promise<number> {
    const result = await databaseService.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  async delete(id: string): Promise<boolean> {
    const result = await databaseService.query(
      'DELETE FROM notifications WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await databaseService.query(
      'DELETE FROM notifications WHERE created_at < $1',
      [date]
    );
    return result.rowCount ?? 0;
  }
}

export const notificationRepository = new NotificationRepository();
