import { Request, Response } from 'express';
import { subscriptionService } from '../services/subscriptionService.js';
import { logger } from '../utils/logger.js';

export class SubscriptionController {
  async getSubscription(req: Request, res: Response): Promise<void> {
    try {
      const subscription = await subscriptionService.getUserSubscription(req.user.id);
      res.json(subscription);
    } catch (error) {
      logger.error('Error fetching subscription:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getSubscriptionById(req: Request, res: Response): Promise<void> {
    try {
      const subscription = await subscriptionService.getSubscription(req.params.id);
      res.json(subscription);
    } catch (error) {
      logger.error('Error fetching subscription:', error);
      res.status(404).json({ error: 'Subscription not found' });
    }
  }

  async createSubscription(req: Request, res: Response): Promise<void> {
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

  async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const subscription = await subscriptionService.cancelSubscription(req.params.id);
      res.json(subscription);
    } catch (error) {
      logger.error('Error canceling subscription:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async renewSubscription(req: Request, res: Response): Promise<void> {
    try {
      const subscription = await subscriptionService.renewSubscription(req.params.id);
      res.json(subscription);
    } catch (error) {
      logger.error('Error renewing subscription:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async upgradeSubscription(req: Request, res: Response): Promise<void> {
    try {
      const subscription = await subscriptionService.upgradeSubscription(req.params.id, req.body.newPlanId);
      res.json(subscription);
    } catch (error) {
      logger.error('Error upgrading subscription:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async downgradeSubscription(req: Request, res: Response): Promise<void> {
    try {
      const subscription = await subscriptionService.downgradeSubscription(req.params.id, req.body.newPlanId);
      res.json(subscription);
    } catch (error) {
      logger.error('Error downgrading subscription:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getExpiringSoon(req: Request, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const subscriptions = await subscriptionService.getExpiringSoon(days);
      res.json(subscriptions);
    } catch (error) {
      logger.error('Error fetching expiring subscriptions:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export const subscriptionController = new SubscriptionController();
