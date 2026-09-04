import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { userService } from '../services/userService.js';
import { logger } from '../utils/logger.js';

export const userController = {
  getProfile: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.getUser(req.user!.id);
    res.json(user);
  }),

  updateProfile: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.updateUser(req.user!.id, req.body);
    res.json(user);
  }),

  deleteProfile: asyncHandler(async (req: Request, res: Response) => {
    await userService.deleteUser(req.user!.id);
    res.status(204).send();
  }),

  getUser: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.getUser(req.params.id);
    res.json(user);
  }),
};
