import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { webhookService } from '../services/webhookService.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const webhooks = await webhookService.getUserWebhooks(req.user.id);
    res.json(webhooks);
  } catch (error) {
    logger.error('Error fetching webhooks:', error);
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
      const webhook = await webhookService.getWebhook(req.params.id);
      res.json(webhook);
    } catch (error) {
      logger.error('Error fetching webhook:', error);
      res.status(404).json({ error: 'Webhook not found' });
    }
  }
);

router.post('/',
  authMiddleware,
  [
    body('url').isURL(),
    body('events').isArray(),
    body('secret').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

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
);

router.put('/:id',
  authMiddleware,
  [
    param('id').isUUID(),
    body('url').optional().isURL(),
    body('events').optional().isArray(),
    body('active').optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const webhook = await webhookService.updateWebhook(req.params.id, req.body);
      res.json(webhook);
    } catch (error) {
      logger.error('Error updating webhook:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.delete('/:id',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      await webhookService.deleteWebhook(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting webhook:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
