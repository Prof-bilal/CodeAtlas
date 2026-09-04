import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notificationService } from '../services/notificationService.js';
import { logger } from '../utils/logger.js';

export const notificationController = {
  getNotifications: asyncHandler(async (req: Request, res: Response) => {
    const notifications = await notificationService.getUserNotifications(req.user!.id, {
      unreadOnly: req.query.unread === 'true',
      limit: parseInt(req.query.limit as string) || 20,
      offset: parseInt(req.query.offset as string) || 0,
    });
    res.json(notifications);
  }),

  getNotification: asyncHandler(async (req: Request, res: Response) => {
    const notification = await notificationService.getNotification(req.params.id);
    res.json(notification);
  }),

  markAsRead: asyncHandler(async (req: Request, res: Response) => {
    const notification = await notificationService.markAsRead(req.params.id);
    res.json(notification);
  }),

  markAllAsRead: asyncHandler(async (req: Request, res: Response) => {
    const count = await notificationService.markAllAsRead(req.user!.id);
    res.json({ count });
  }),

  getUnreadCount: asyncHandler(async (req: Request, res: Response) => {
    const count = await notificationService.getUnreadCount(req.user!.id);
    res.json({ count });
  }),

  deleteNotification: asyncHandler(async (req: Request, res: Response) => {
    await notificationService.deleteNotification(req.params.id);
    res.status(204).send();
  }),
};
