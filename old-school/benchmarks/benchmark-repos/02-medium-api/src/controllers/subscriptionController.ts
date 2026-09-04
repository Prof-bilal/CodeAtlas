import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { subscriptionService } from '../services/subscriptionService.js';
import { logger } from '../utils/logger.js';

export const subscriptionController = {
  getSubscription: asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.getUserSubscription(req.user!.id);
    res.json(subscription);
  }),

  getSubscriptionById: asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.getSubscription(req.params.id);
    res.json(subscription);
  }),

  createSubscription: asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.createSubscription({
      ...req.body,
      userId: req.user!.id,
    });
    res.status(201).json(subscription);
  }),

  cancelSubscription: asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.cancelSubscription(req.params.id);
    res.json(subscription);
  }),

  renewSubscription: asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.renewSubscription(req.params.id);
    res.json(subscription);
  }),

  upgradeSubscription: asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.upgradeSubscription(req.params.id, req.body.newPlanId);
    res.json(subscription);
  }),

  getExpiringSoon: asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 7;
    const subscriptions = await subscriptionService.getExpiringSoon(days);
    res.json(subscriptions);
  }),
};
