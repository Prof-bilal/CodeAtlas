import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { taskService } from '../services/taskService.js';
import { logger } from '../utils/logger.js';

export const taskController = {
  getTasks: asyncHandler(async (req: Request, res: Response) => {
    const tasks = await taskService.getTasksByUser(req.user!.id, {
      status: req.query.status as string,
      limit: parseInt(req.query.limit as string) || 20,
      offset: parseInt(req.query.offset as string) || 0,
    });
    res.json(tasks);
  }),

  getTask: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.getTask(req.params.id);
    res.json(task);
  }),

  createTask: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.createTask({
      ...req.body,
      userId: req.user!.id,
    });
    res.status(201).json(task);
  }),

  updateTask: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.updateTask(req.params.id, req.body);
    res.json(task);
  }),

  deleteTask: asyncHandler(async (req: Request, res: Response) => {
    await taskService.deleteTask(req.params.id);
    res.status(204).send();
  }),

  completeTask: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.completeTask(req.params.id);
    res.json(task);
  }),

  assignTask: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.assignTask(req.params.id, req.body.assigneeId);
    res.json(task);
  }),

  getOverdueTasks: asyncHandler(async (req: Request, res: Response) => {
    const tasks = await taskService.getOverdueTasks();
    res.json(tasks);
  }),
};
