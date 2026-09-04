import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { apiKeyService } from '../services/apiKeyService.js';
import { logger } from '../utils/logger.js';

export const apiKeyController = {
  getApiKeys: asyncHandler(async (req: Request, res: Response) => {
    const apiKeys = await apiKeyService.getUserApiKeys(req.user!.id);
    res.json(apiKeys);
  }),

  getApiKey: asyncHandler(async (req: Request, res: Response) => {
    const apiKey = await apiKeyService.getApiKey(req.params.id);
    res.json(apiKey);
  }),

  createApiKey: asyncHandler(async (req: Request, res: Response) => {
    const apiKey = await apiKeyService.createApiKey(req.user!.id, req.body.name, req.body.permissions);
    res.status(201).json(apiKey);
  }),

  revokeApiKey: asyncHandler(async (req: Request, res: Response) => {
    await apiKeyService.revokeApiKey(req.params.id);
    res.status(204).send();
  }),
};
