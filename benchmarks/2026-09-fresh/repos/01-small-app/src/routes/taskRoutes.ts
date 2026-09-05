import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { taskService } from '../services/taskService.js';
import { authenticate, authorize, authorizeTaskOwnerOrAdmin } from '../middleware/auth.js';
import { asyncHandler, checkValidation } from './routeHelpers.js';
import { parsePagination } from '../utils/pagination.js';

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

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as { page?: string; limit?: string });

  const filters = {
    status: req.query.status as string,
    priority: req.query.priority as string,
    assignedTo: req.query.assignedTo as string,
    search: req.query.search as string,
    tag: req.query.tag as string,
  };

  const result = await taskService.findAll(req.user!.id, filters, params);
  res.json(result);
}));

router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await taskService.getStats(req.user!.id);
  res.json(stats);
}));

router.get('/overdue', asyncHandler(async (req: Request, res: Response) => {
  const tasks = await taskService.findOverdueTasks(req.user!.id);
  res.json({ data: tasks });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const task = await taskService.findById(req.params.id, req.user!.id);
  res.json(task);
}));

router.post('/', createTaskValidation, asyncHandler(async (req: Request, res: Response) => {
  if (!checkValidation(req, res)) return;

  const task = await taskService.create(req.body, req.user!.id);
  res.status(201).json(task);
}));

router.put('/:id', updateTaskValidation, authorizeTaskOwnerOrAdmin, asyncHandler(async (req: Request, res: Response) => {
  if (!checkValidation(req, res)) return;

  const task = await taskService.update(req.params.id, req.body, req.user!.id);
  res.json(task);
}));

router.delete('/:id', authorize('admin'), asyncHandler(async (req: Request, res: Response) => {
  await taskService.delete(req.params.id, req.user!.id);
  res.status(204).send();
}));

router.patch('/:id/complete', authorizeTaskOwnerOrAdmin, asyncHandler(async (req: Request, res: Response) => {
  const task = await taskService.markAsCompleted(req.params.id, req.user!.id);
  res.json(task);
}));

router.patch('/:id/start', authorizeTaskOwnerOrAdmin, asyncHandler(async (req: Request, res: Response) => {
  const task = await taskService.markAsInProgress(req.params.id, req.user!.id);
  res.json(task);
}));

router.patch('/:id/cancel', authorizeTaskOwnerOrAdmin, asyncHandler(async (req: Request, res: Response) => {
  const task = await taskService.cancel(req.params.id, req.user!.id);
  res.json(task);
}));

router.patch('/:id/assign', authorizeTaskOwnerOrAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { assignedTo } = req.body;
  const task = await taskService.assignTo(req.params.id, assignedTo, req.user!.id);
  res.json(task);
}));

export default router;
