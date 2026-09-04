import { Request, Response } from 'express';
import { apiKeyService } from '../services/apiKeyService.js';
import { logger } from '../utils/logger.js';

export class ApiKeyController {
  async getApiKeys(req: Request, res: Response): Promise<void> {
    try {
      const apiKeys = await apiKeyService.getUserApiKeys(req.user.id);
      res.json(apiKeys);
    } catch (error) {
      logger.error('Error fetching API keys:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getApiKey(req: Request, res: Response): Promise<void> {
    try {
      const apiKey = await apiKeyService.getApiKey(req.params.id);
      res.json(apiKey);
    } catch (error) {
      logger.error('Error fetching API key:', error);
      res.status(404).json({ error: 'API key not found' });
    }
  }

  async createApiKey(req: Request, res: Response): Promise<void> {
    try {
      const apiKey = await apiKeyService.createApiKey(req.user.id, req.body.name, req.body.permissions);
      res.status(201).json(apiKey);
    } catch (error) {
      logger.error('Error creating API key:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async revokeApiKey(req: Request, res: Response): Promise<void> {
    try {
      await apiKeyService.revokeApiKey(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error revoking API key:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async validateApiKey(req: Request, res: Response): Promise<void> {
    try {
      const apiKey = await apiKeyService.validateApiKey(req.body.key);
      res.json({ valid: !!apiKey });
    } catch (error) {
      logger.error('Error verifying API key:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export const apiKeyController = new ApiKeyController();
