import { Request, Response } from 'express';
import { notificationService } from '../services/notificationService.js';
import { logger } from '../utils/logger.js';

export class NotificationController {
  async getNotifications(req: Request, res: Response): Promise<void> {
    try {
      const notifications = await notificationService.getUserNotifications(req.user.id, {
        unreadOnly: req.query.unread === 'true',
        limit: parseInt(req.query.limit as string) || 20,
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(notifications);
    } catch (error) {
      logger.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getNotification(req: Request, res: Response): Promise<void> {
    try {
      const notification = await notificationService.getNotification(req.params.id);
      res.json(notification);
    } catch (error) {
      logger.error('Error fetching notification:', error);
      res.status(404).json({ error: 'Notification not found' });
    }
  }

  async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      const notification = await notificationService.markAsRead(req.params.id);
      res.json(notification);
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async markAllAsRead(req: Request, res: Response): Promise<void> {
    try {
      const count = await notificationService.markAllAsRead(req.user.id);
      res.json({ count });
    } catch (error) {
      logger.error('Error marking all as read:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async deleteNotification(req: Request, res: Response): Promise<void> {
    try {
      await notificationService.deleteNotification(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting notification:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getUnreadCount(req: Request, res: Response): Promise<void> {
    try {
      const count = await notificationService.getUnreadCount(req.user.id);
      res.json({ count });
    } catch (error) {
      logger.error('Error fetching unread count:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async deleteOldNotifications(req: Request, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const count = await notificationService.deleteOldNotifications(days);
      res.json({ deleted: count });
    } catch (error) {
      logger.error('Error cleaning up notifications:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export const notificationController = new NotificationController();
