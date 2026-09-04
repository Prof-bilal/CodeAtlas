import { query, queryOne } from '../config/database.js';
import { NotificationModel, CreateNotificationInput } from '../models/notification.js';

export class NotificationRepository {
  async findById(id: string): Promise<NotificationModel | null> {
    const row = await queryOne<any>(
      'SELECT * FROM notifications WHERE id = $1',
      [id]
    );
    
    if (!row) return null;
    
    return this.mapRowToNotification(row);
  }

  async create(input: CreateNotificationInput): Promise<NotificationModel> {
    const row = await queryOne<any>(
      `INSERT INTO notifications (user_id, type, category, title, message, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.userId,
        input.type,
        input.category,
        input.title,
        input.message,
        input.data ? JSON.stringify(input.data) : null,
      ]
    );
    
    return this.mapRowToNotification(row!);
  }

  async markAsRead(id: string): Promise<void> {
    await query(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  async markAllAsRead(userId: string): Promise<void> {
    await query(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    );
  }

  async delete(id: string): Promise<void> {
    await query(
      'DELETE FROM notifications WHERE id = $1',
      [id]
    );
  }

  async deleteAllByUserId(userId: string): Promise<void> {
    await query(
      'DELETE FROM notifications WHERE user_id = $1',
      [userId]
    );
  }

  async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<NotificationModel[]> {
    const rows = await query<any>(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    
    return rows.map(this.mapRowToNotification);
  }

  async countByUserId(userId: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1',
      [userId]
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async countUnreadByUserId(userId: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async findUnreadByUserId(userId: string): Promise<NotificationModel[]> {
    const rows = await query<any>(
      'SELECT * FROM notifications WHERE user_id = $1 AND read_at IS NULL ORDER BY created_at DESC',
      [userId]
    );
    
    return rows.map(this.mapRowToNotification);
  }

  async findByCategory(userId: string, category: string): Promise<NotificationModel[]> {
    const rows = await query<any>(
      'SELECT * FROM notifications WHERE user_id = $1 AND category = $2 ORDER BY created_at DESC',
      [userId, category]
    );
    
    return rows.map(this.mapRowToNotification);
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await query(
      'DELETE FROM notifications WHERE created_at < $1',
      [date]
    );
    
    return result.length;
  }

  private mapRowToNotification(row: any): NotificationModel {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      category: row.category,
      title: row.title,
      message: row.message,
      data: row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null,
      readAt: row.read_at ? new Date(row.read_at) : null,
      createdAt: new Date(row.created_at),
    };
  }
}

export const notificationRepository = new NotificationRepository();
