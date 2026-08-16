import { Request, Response } from 'express';
import { webhookService } from '../services/webhookService.js';
import { logger } from '../utils/logger.js';

export class WebhookController {
  async getWebhooks(req: Request, res: Response): Promise<void> {
    try {
      const webhooks = await webhookService.getUserWebhooks(req.user.id);
      res.json(webhooks);
    } catch (error) {
      logger.error('Error fetching webhooks:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhook = await webhookService.getWebhook(req.params.id);
      res.json(webhook);
    } catch (error) {
      logger.error('Error fetching webhook:', error);
      res.status(404).json({ error: 'Webhook not found' });
    }
  }

  async createWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhook = await webhookService.createWebhook({
        ...req.body,
        userId: req.user.id,
      });
      res.status(201).json(webhook);
    } catch (error) {
      logger.error('Error creating webhook:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async updateWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhook = await webhookService.updateWebhook(req.params.id, req.body);
      res.json(webhook);
    } catch (error) {
      logger.error('Error updating webhook:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async deleteWebhook(req: Request, res: Response): Promise<void> {
    try {
      await webhookService.deleteWebhook(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting webhook:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async testWebhook(req: Request, res: Response): Promise<void> {
    try {
      const result = await webhookService.testWebhook(req.params.id);
      res.json(result);
    } catch (error) {
      logger.error('Error testing webhook:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getWebhookLogs(req: Request, res: Response): Promise<void> {
    try {
      const logs = await webhookService.getWebhookLogs(req.params.id);
      res.json(logs);
    } catch (error) {
      logger.error('Error fetching webhook logs:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export const webhookController = new WebhookController();
