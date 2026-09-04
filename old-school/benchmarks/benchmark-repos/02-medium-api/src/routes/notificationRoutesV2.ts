import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { notificationService } from '../services/notificationService.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
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
});

router.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.json({ count });
  } catch (error) {
    logger.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/:id', 
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const notification = await notificationService.getNotification(req.params.id);
      res.json(notification);
    } catch (error) {
      logger.error('Error fetching notification:', error);
      res.status(404).json({ error: 'Notification not found' });
    }
  }
);

router.post('/:id/read',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const notification = await notificationService.markAsRead(req.params.id);
      res.json(notification);
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/read-all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const count = await notificationService.markAllAsRead(req.user.id);
    res.json({ count });
  } catch (error) {
    logger.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/:id',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      await notificationService.deleteNotification(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting notification:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.delete('/cleanup',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const count = await notificationService.deleteOldNotifications(days);
      res.json({ deleted: count });
    } catch (error) {
      logger.error('Error cleaning up notifications:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
