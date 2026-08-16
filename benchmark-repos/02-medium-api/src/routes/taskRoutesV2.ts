import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { taskService } from '../services/taskService.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tasks = await taskService.getTasksByUser(req.user.id, {
      status: req.query.status as string,
      limit: parseInt(req.query.limit as string) || 20,
      offset: parseInt(req.query.offset as string) || 0,
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
    });
    res.json(tasks);
  } catch (error) {
    logger.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/overdue', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tasks = await taskService.getOverdueTasks();
    res.json(tasks);
  } catch (error) {
    logger.error('Error fetching overdue tasks:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await taskService.getTaskStats(req.user.id);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching task stats:', error);
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
      const task = await taskService.getTask(req.params.id);
      res.json(task);
    } catch (error) {
      logger.error('Error fetching task:', error);
      res.status(404).json({ error: 'Task not found' });
    }
  }
);

router.post('/',
  authMiddleware,
  [
    body('title').isString().trim().notEmpty(),
    body('description').optional().isString().trim(),
    body('priority').optional().isInt({ min: 0, max: 10 }),
    body('dueDate').optional().isISO8601(),
    body('assignedTo').optional().isUUID(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

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
);

router.put('/:id',
  authMiddleware,
  [
    param('id').isUUID(),
    body('title').optional().isString().trim(),
    body('description').optional().isString().trim(),
    body('status').optional().isIn(['pending', 'in_progress', 'completed', 'cancelled']),
    body('priority').optional().isInt({ min: 0, max: 10 }),
    body('dueDate').optional().isISO8601(),
    body('assignedTo').optional().isUUID(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const task = await taskService.updateTask(req.params.id, req.body);
      res.json(task);
    } catch (error) {
      logger.error('Error updating task:', error);
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
      await taskService.deleteTask(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting task:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/:id/complete',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const task = await taskService.completeTask(req.params.id);
      res.json(task);
    } catch (error) {
      logger.error('Error completing task:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/:id/assign',
  authMiddleware,
  [
    param('id').isUUID(),
    body('assigneeId').isUUID(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const task = await taskService.assignTask(req.params.id, req.body.assigneeId);
      res.json(task);
    } catch (error) {
      logger.error('Error assigning task:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/:id/comment',
  authMiddleware,
  [
    param('id').isUUID(),
    body('content').isString().trim().notEmpty(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const comment = await taskService.addComment(req.params.id, req.user.id, req.body.content);
      res.status(201).json(comment);
    } catch (error) {
      logger.error('Error adding comment:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.get('/:id/comments',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const comments = await taskService.getComments(req.params.id);
      res.json(comments);
    } catch (error) {
      logger.error('Error fetching comments:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
