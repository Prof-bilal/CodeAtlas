import { Router, Request, Response } from 'express';
import { auditService } from '../services/auditService.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', 
  authMiddleware, 
  adminMiddleware, 
  async (req: Request, res: Response) => {
    try {
      const count = await auditService.getCount();
      res.json({ count });
    } catch (error) {
      logger.error('Error fetching audit count:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.get('/user/:userId',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const logs = await auditService.getLogsByUser(req.params.userId);
      res.json(logs);
    } catch (error) {
      logger.error('Error fetching user audit logs:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.get('/resource/:resource',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const logs = await auditService.getLogsByResource(req.params.resource, req.query.resourceId as string);
      res.json(logs);
    } catch (error) {
      logger.error('Error fetching resource audit logs:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.get('/action/:action',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const logs = await auditService.getLogsByAction(req.params.action);
      res.json(logs);
    } catch (error) {
      logger.error('Error fetching action audit logs:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.delete('/cleanup',
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 90;
      const count = await auditService.deleteOldLogs(days);
      res.json({ deleted: count });
    } catch (error) {
      logger.error('Error cleaning up audit logs:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
