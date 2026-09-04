import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { subscriptionService } from '../services/subscriptionService.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const subscription = await subscriptionService.getUserSubscription(req.user.id);
    res.json(subscription);
  } catch (error) {
    logger.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/expiring', authMiddleware, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const subscriptions = await subscriptionService.getExpiringSoon(days);
    res.json(subscriptions);
  } catch (error) {
    logger.error('Error fetching expiring subscriptions:', error);
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
      const subscription = await subscriptionService.getSubscription(req.params.id);
      res.json(subscription);
    } catch (error) {
      logger.error('Error fetching subscription:', error);
      res.status(404).json({ error: 'Subscription not found' });
    }
  }
);

router.post('/',
  authMiddleware,
  [
    body('planId').isString().notEmpty(),
    body('currentPeriodStart').isISO8601(),
    body('currentPeriodEnd').isISO8601(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const subscription = await subscriptionService.createSubscription({
        ...req.body,
        userId: req.user.id,
      });
      res.status(201).json(subscription);
    } catch (error) {
      logger.error('Error creating subscription:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/:id/cancel',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const subscription = await subscriptionService.cancelSubscription(req.params.id);
      res.json(subscription);
    } catch (error) {
      logger.error('Error canceling subscription:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/:id/renew',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const subscription = await subscriptionService.renewSubscription(req.params.id);
      res.json(subscription);
    } catch (error) {
      logger.error('Error renewing subscription:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/:id/upgrade',
  authMiddleware,
  [
    param('id').isUUID(),
    body('newPlanId').isString().notEmpty(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const subscription = await subscriptionService.upgradeSubscription(req.params.id, req.body.newPlanId);
      res.json(subscription);
    } catch (error) {
      logger.error('Error upgrading subscription:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/:id/downgrade',
  authMiddleware,
  [
    param('id').isUUID(),
    body('newPlanId').isString().notEmpty(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const subscription = await subscriptionService.downgradeSubscription(req.params.id, req.body.newPlanId);
      res.json(subscription);
    } catch (error) {
      logger.error('Error downgrading subscription:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
