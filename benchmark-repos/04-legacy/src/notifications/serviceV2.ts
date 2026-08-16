// Notification service v2 - CURRENT

import { Database } from '../database/connection';
import { Redis } from '../integrations/redis';
import { Logger } from '../utils';
import { v4 as uuidv4 } from 'uuid';

export interface Notification {
  id: string;
  userId: string;
  type: 'email' | 'sms' | 'push' | 'in_app';
  channel: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'read';
  readAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface NotificationPreference {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

export class NotificationServiceV2 {
  private db: Database;
  private redis: Redis;

  constructor(db: Database, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  async send(input: {
    userId: string;
    type: Notification['type'];
    channel: string;
    title: string;
    body: string;
    data?: Record<string, any>;
  }): Promise<Notification> {
    const id = uuidv4();

    const notification: Notification = {
      id,
      userId: input.userId,
      type: input.type,
      channel: input.channel,
      title: input.title,
      body: input.body,
      data: input.data,
      status: 'pending',
      readAt: null,
      sentAt: null,
      createdAt: new Date(),
    };

    await this.db.query(
      INSERT INTO notifications (id, user_id, type, channel, title, body, data, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?),
      [id, input.userId, input.type, input.channel, input.title, input.body,
       JSON.stringify(input.data || {}), 'pending', new Date().toISOString()]
    );

    // Check preferences
    const prefs = await this.getPreferences(input.userId);
    if (!this.isEnabled(prefs, input.type)) {
      notification.status = 'failed';
      return notification;
    }

    // Send based on type
    try {
      await this.deliverNotification(notification);
      notification.status = 'sent';
      notification.sentAt = new Date();

      await this.db.query(
        "UPDATE notifications SET status = 'sent', sent_at = ? WHERE id = ?",
        [notification.sentAt.toISOString(), id]
      );
    } catch (err) {
      notification.status = 'failed';
      Logger.error(Notification failed: , err);
    }

    return notification;
  }

  async sendBulk(notifications: Array<{
    userId: string;
    type: Notification['type'];
    channel: string;
    title: string;
    body: string;
  }>): Promise<Notification[]> {
    const results: Notification[] = [];
    for (const notif of notifications) {
      results.push(await this.send(notif));
    }
    return results;
  }

  async getNotifications(userId: string, page = 1, limit = 20): Promise<Notification[]> {
    const offset = (page - 1) * limit;
    const results = await this.db.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    ) as any[];

    return results.map(this.mapRow);
  }

  async markAsRead(notificationId: string): Promise<void> {
    await this.db.query(
      "UPDATE notifications SET status = 'read', read_at = ? WHERE id = ?",
      [new Date().toISOString(), notificationId]
    );
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.db.query(
      "UPDATE notifications SET status = 'read', read_at = ? WHERE user_id = ? AND status != 'read'",
      [new Date().toISOString(), userId]
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    const results = await this.db.query(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND status != 'read'",
      [userId]
    ) as any[];
    return results[0].count;
  }

  async getPreferences(userId: string): Promise<NotificationPreference> {
    const results = await this.db.query(
      'SELECT * FROM notification_preferences WHERE user_id = ?',
      [userId]
    ) as any[];

    if (results.length > 0) {
      return {
        userId: results[0].user_id,
        emailEnabled: results[0].email_enabled,
        smsEnabled: results[0].sms_enabled,
        pushEnabled: results[0].push_enabled,
        inAppEnabled: results[0].in_app_enabled,
        quietHoursStart: results[0].quiet_hours_start,
        quietHoursEnd: results[0].quiet_hours_end,
      };
    }

    // Default preferences
    return {
      userId,
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      inAppEnabled: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    };
  }

  async updatePreferences(userId: string, prefs: Partial<NotificationPreference>): Promise<void> {
    await this.db.query(
      INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, push_enabled, in_app_enabled, quiet_hours_start, quiet_hours_end)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         email_enabled = EXCLUDED.email_enabled,
         sms_enabled = EXCLUDED.sms_enabled,
         push_enabled = EXCLUDED.push_enabled,
         in_app_enabled = EXCLUDED.in_app_enabled,
         quiet_hours_start = EXCLUDED.quiet_hours_start,
         quiet_hours_end = EXCLUDED.quiet_hours_end,
      [userId, prefs.emailEnabled ?? true, prefs.smsEnabled ?? false,
       prefs.pushEnabled ?? true, prefs.inAppEnabled ?? true,
       prefs.quietHoursStart ?? null, prefs.quietHoursEnd ?? null]
    );
  }

  private isEnabled(prefs: NotificationPreference, type: Notification['type']): boolean {
    switch (type) {
      case 'email': return prefs.emailEnabled;
      case 'sms': return prefs.smsEnabled;
      case 'push': return prefs.pushEnabled;
      case 'in_app': return prefs.inAppEnabled;
      default: return true;
    }
  }

  private async deliverNotification(notification: Notification): Promise<void> {
    // Delivery logic based on type
    switch (notification.type) {
      case 'email':
        // Send email
        break;
      case 'sms':
        // Send SMS
        break;
      case 'push':
        // Send push notification
        break;
      case 'in_app':
        // Store in-app notification
        break;
    }
  }

  private mapRow(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      channel: row.channel,
      title: row.title,
      body: row.body,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      status: row.status,
      readAt: row.read_at ? new Date(row.read_at) : null,
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
