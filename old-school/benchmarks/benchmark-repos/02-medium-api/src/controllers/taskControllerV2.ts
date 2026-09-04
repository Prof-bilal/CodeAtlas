import { Request, Response } from 'express';
import { taskService } from '../services/taskService.js';
import { logger } from '../utils/logger.js';
import { TaskStatus, TaskPriority } from '../types/responses.js';

export class TaskController {
  async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const { status, limit, offset, sortBy, sortOrder } = req.query;
      const tasks = await taskService.getTasksByUser(req.user.id, {
        status: status as TaskStatus,
        limit: parseInt(limit as string) || 20,
        offset: parseInt(offset as string) || 0,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
      });
      res.json(tasks);
    } catch (error) {
      logger.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getTask(req: Request, res: Response): Promise<void> {
    try {
      const task = await taskService.getTask(req.params.id);
      res.json(task);
    } catch (error) {
      logger.error('Error fetching task:', error);
      res.status(404).json({ error: 'Task not found' });
    }
  }

  async createTask(req: Request, res: Response): Promise<void> {
    try {
      const task = await taskService.createTask({
        ...req.body,
        userId: req.user.id,
      });
      res.status(201).json(task);
    } catch (error) {
      logger.error('Error creating task:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const task = await taskService.updateTask(req.params.id, req.body);
      res.json(task);
    } catch (error) {
      logger.error('Error updating task:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      await taskService.deleteTask(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting task:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async completeTask(req: Request, res: Response): Promise<void> {
    try {
      const task = await taskService.completeTask(req.params.id);
      res.json(task);
    } catch (error) {
      logger.error('Error completing task:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async assignTask(req: Request, res: Response): Promise<void> {
    try {
      const task = await taskService.assignTask(req.params.id, req.body.assigneeId);
      res.json(task);
    } catch (error) {
      logger.error('Error assigning task:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async addComment(req: Request, res: Response): Promise<void> {
    try {
      const comment = await taskService.addComment(req.params.id, req.user.id, req.body.content);
      res.status(201).json(comment);
    } catch (error) {
      logger.error('Error adding comment:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getComments(req: Request, res: Response): Promise<void> {
    try {
      const comments = await taskService.getComments(req.params.id);
      res.json(comments);
    } catch (error) {
      logger.error('Error fetching comments:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getTaskStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await taskService.getTaskStats(req.user.id);
      res.json(stats);
    } catch (error) {
      logger.error('Error fetching task stats:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export const taskController = new TaskController();
