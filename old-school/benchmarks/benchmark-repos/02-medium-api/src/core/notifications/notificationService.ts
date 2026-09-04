import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { EventBus } from '../../events/eventBus.js';
import { cacheService } from '../../services/cacheService.js';
import nodemailer from 'nodemailer';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, any>;
  readAt?: Date;
  createdAt: Date;
}

export interface NotificationOptions {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

export class NotificationService {
  private notifications: Notification[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async createNotification(data: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification> {
    const notification: Notification = {
      ...data,
      id: uuidv4(),
      createdAt: new Date(),
    };

    this.notifications.push(notification);
    await cacheService.invalidate(`notifications:${data.userId}`);
    this.eventBus.emit('notification:created', { notification });

    return notification;
  }

  async getNotification(id: string): Promise<Notification> {
    const notification = this.notifications.find(n => n.id === id);
    if (!notification) {
      throw new Error('Notification not found');
    }
    return notification;
  }

  async getUserNotifications(userId: string, options: NotificationOptions): Promise<Notification[]> {
    let notifications = this.notifications.filter(n => n.userId === userId);

    if (options.unreadOnly) {
      notifications = notifications.filter(n => !n.readAt);
    }

    notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = options.offset || 0;
    const limit = options.limit || 20;
    return notifications.slice(offset, offset + limit);
  }

  async markAsRead(id: string): Promise<Notification> {
    const notification = await this.getNotification(id);
    notification.readAt = new Date();

    await cacheService.invalidate(`notifications:${notification.userId}`);
    this.eventBus.emit('notification:read', { notification });

    return notification;
  }

  async markAllAsRead(userId: string): Promise<number> {
    let count = 0;
    for (const notification of this.notifications) {
      if (notification.userId === userId && !notification.readAt) {
        notification.readAt = new Date();
        count++;
      }
    }

    await cacheService.invalidate(`notifications:${userId}`);
    this.eventBus.emit('notifications:all:read', { userId, count });

    return count;
  }

  async deleteNotification(id: string): Promise<void> {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index === -1) {
      throw new Error('Notification not found');
    }

    const [deletedNotification] = this.notifications.splice(index, 1);
    await cacheService.invalidate(`notifications:${deletedNotification.userId}`);
    this.eventBus.emit('notification:deleted', { notificationId: id });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifications.filter(n => n.userId === userId && !n.readAt).length;
  }

  async deleteOldNotifications(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const initialCount = this.notifications.length;
    this.notifications = this.notifications.filter(n => n.createdAt > cutoff);
    return initialCount - this.notifications.length;
  }
}

export const notificationService = new NotificationService(new EventBus());
