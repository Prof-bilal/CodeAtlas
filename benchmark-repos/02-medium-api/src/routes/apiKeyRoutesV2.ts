import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { apiKeyService } from '../services/apiKeyService.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const apiKeys = await apiKeyService.getUserApiKeys(req.user.id);
    res.json(apiKeys);
  } catch (error) {
    logger.error('Error fetching API keys:', error);
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
      const apiKey = await apiKeyService.getApiKey(req.params.id);
      res.json(apiKey);
    } catch (error) {
      logger.error('Error fetching API key:', error);
      res.status(404).json({ error: 'API key not found' });
    }
  }
);

router.post('/',
  authMiddleware,
  [
    body('name').isString().trim().notEmpty(),
    body('permissions').optional().isArray(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const apiKey = await apiKeyService.createApiKey(req.user.id, req.body.name, req.body.permissions);
      res.status(201).json(apiKey);
    } catch (error) {
      logger.error('Error creating API key:', error);
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
      await apiKeyService.revokeApiKey(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error revoking API key:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/:id/verify',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const apiKey = await apiKeyService.validateApiKey(req.body.key);
      res.json({ valid: !!apiKey });
    } catch (error) {
      logger.error('Error verifying API key:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
