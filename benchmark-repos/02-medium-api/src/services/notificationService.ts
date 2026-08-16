import { NotificationRepository } from '../database/repositories/notificationRepository.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';

export interface NotificationService {
  getNotification(id: string): Promise<any>;
  getUserNotifications(userId: string, options?: any): Promise<any[]>;
  createNotification(data: any): Promise<any>;
  markAsRead(id: string): Promise<any>;
  markAllAsRead(userId: string): Promise<number>;
  getUnreadCount(userId: string): Promise<number>;
  deleteNotification(id: string): Promise<boolean>;
  deleteOldNotifications(olderThanDays: number): Promise<number>;
}

export class NotificationServiceImpl implements NotificationService {
  private notificationRepository: NotificationRepository;

  constructor() {
    this.notificationRepository = new NotificationRepository();
  }

  async getNotification(id: string): Promise<any> {
    const notification = await this.notificationRepository.findById(id);
    if (!notification) {
      throw new Error('Notification not found');
    }
    return notification;
  }

  async getUserNotifications(userId: string, options?: { unreadOnly?: boolean; limit?: number; offset?: number }): Promise<any[]> {
    return this.notificationRepository.findByUserId(userId, options);
  }

  async createNotification(data: any): Promise<any> {
    const notification = await this.notificationRepository.create(data);

    await eventBus.publish('notification.created', {
      notificationId: notification.id,
      userId: data.userId,
      type: data.type,
      title: data.title,
    }, 'notification-service');

    return notification;
  }

  async markAsRead(id: string): Promise<any> {
    const notification = await this.notificationRepository.findById(id);
    if (!notification) {
      throw new Error('Notification not found');
    }

    const updatedNotification = await this.notificationRepository.markAsRead(id);

    await eventBus.publish('notification.read', {
      notificationId: id,
      userId: notification.userId,
    }, 'notification-service');

    return updatedNotification;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const count = await this.notificationRepository.markAllAsRead(userId);

    await eventBus.publish('notification.all_read', {
      userId,
      count,
    }, 'notification-service');

    return count;
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.countUnread(userId);
  }

  async deleteNotification(id: string): Promise<boolean> {
    const notification = await this.notificationRepository.findById(id);
    if (!notification) {
      throw new Error('Notification not found');
    }

    const deleted = await this.notificationRepository.delete(id);

    await eventBus.publish('notification.deleted', {
      notificationId: id,
      userId: notification.userId,
    }, 'notification-service');

    return deleted;
  }

  async deleteOldNotifications(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    return this.notificationRepository.deleteOlderThan(cutoffDate);
  }
}

export const notificationService = new NotificationServiceImpl();
