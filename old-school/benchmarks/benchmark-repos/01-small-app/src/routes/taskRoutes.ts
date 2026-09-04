import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { taskService } from '../services/taskService.js';
import { authenticate, authorize, authorizeTaskOwnerOrAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

const createTaskValidation = [
  body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Title is required (max 255 chars)'),
  body('description').optional().trim().isLength({ max: 2000 }).withMessage('Description max 2000 chars'),
  body('status').optional().isIn(['pending', 'in_progress', 'completed', 'cancelled']).withMessage('Invalid status'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
  body('dueDate').optional().isISO8601().withMessage('Invalid date format'),
  body('assignedTo').optional().isUUID().withMessage('Invalid user ID'),
];

const updateTaskValidation = [
  body('title').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Title max 255 chars'),
  body('description').optional().trim().isLength({ max: 2000 }).withMessage('Description max 2000 chars'),
  body('status').optional().isIn(['pending', 'in_progress', 'completed', 'cancelled']).withMessage('Invalid status'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
  body('dueDate').optional({ nullable: true }).isISO8601().withMessage('Invalid date format'),
  body('assignedTo').optional({ nullable: true }).isUUID().withMessage('Invalid user ID'),
];

router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const filters = {
      status: req.query.status as string,
      priority: req.query.priority as string,
      assignedTo: req.query.assignedTo as string,
      search: req.query.search as string,
      tag: req.query.tag as string,
    };

    const result = await taskService.findAll(req.user.id, filters, page, limit);
    res.json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get('/stats', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const stats = await taskService.getStats(req.user.id);
    res.json(stats);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get('/overdue', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const tasks = await taskService.findOverdueTasks(req.user.id);
    res.json({ data: tasks });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const task = await taskService.findById(req.params.id, req.user.id);
    res.json(task);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post('/', createTaskValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const task = await taskService.create(req.body, req.user.id);
    res.status(201).json(task);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.put('/:id', updateTaskValidation, authorizeTaskOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const task = await taskService.update(req.params.id, req.body, req.user.id);
    res.json(task);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.delete('/:id', authorize('admin'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await taskService.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.patch('/:id/complete', authorizeTaskOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const task = await taskService.markAsCompleted(req.params.id, req.user.id);
    res.json(task);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.patch('/:id/start', authorizeTaskOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const task = await taskService.markAsInProgress(req.params.id, req.user.id);
    res.json(task);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.patch('/:id/cancel', authorizeTaskOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const task = await taskService.cancel(req.params.id, req.user.id);
    res.json(task);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.patch('/:id/assign', authorizeTaskOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { assignedTo } = req.body;
    const task = await taskService.assignTo(req.params.id, assignedTo, req.user.id);
    res.json(task);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

export default router;
