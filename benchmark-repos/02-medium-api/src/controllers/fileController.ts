import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { fileService } from '../services/fileService.js';
import { logger } from '../utils/logger.js';

export const fileController = {
  getFiles: asyncHandler(async (req: Request, res: Response) => {
    const files = await fileService.getUserFiles(req.user!.id);
    res.json(files);
  }),

  getFile: asyncHandler(async (req: Request, res: Response) => {
    const file = await fileService.getFile(req.params.id);
    res.json(file);
  }),

  uploadFile: asyncHandler(async (req: Request, res: Response) => {
    const file = await fileService.uploadFile({
      ...req.body,
      userId: req.user!.id,
    });
    res.status(201).json(file);
  }),

  deleteFile: asyncHandler(async (req: Request, res: Response) => {
    await fileService.deleteFile(req.params.id);
    res.status(204).send();
  }),

  getStorageUsage: asyncHandler(async (req: Request, res: Response) => {
    const usage = await fileService.getStorageUsage(req.user!.id);
    res.json({ usage });
  }),
};
