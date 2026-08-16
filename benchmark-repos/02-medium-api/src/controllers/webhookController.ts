import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { webhookService } from '../services/webhookService.js';
import { logger } from '../utils/logger.js';

export const webhookController = {
  getWebhooks: asyncHandler(async (req: Request, res: Response) => {
    const webhooks = await webhookService.getUserWebhooks(req.user!.id);
    res.json(webhooks);
  }),

  getWebhook: asyncHandler(async (req: Request, res: Response) => {
    const webhook = await webhookService.getWebhook(req.params.id);
    res.json(webhook);
  }),

  createWebhook: asyncHandler(async (req: Request, res: Response) => {
    const webhook = await webhookService.createWebhook({
      ...req.body,
      userId: req.user!.id,
    });
    res.status(201).json(webhook);
  }),

  updateWebhook: asyncHandler(async (req: Request, res: Response) => {
    const webhook = await webhookService.updateWebhook(req.params.id, req.body);
    res.json(webhook);
  }),

  deleteWebhook: asyncHandler(async (req: Request, res: Response) => {
    await webhookService.deleteWebhook(req.params.id);
    res.status(204).send();
  }),
};
