import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { tagService } from '../services/tagService.js';
import { authenticate } from '../middleware/auth.js';
import { isValidColor } from '../models/tag.js';
import { asyncHandler, checkValidation } from './routeHelpers.js';
import { parsePagination } from '../utils/pagination.js';

const router = Router();

router.use(authenticate);

const createTagValidation = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Tag name is required (max 100 chars)'),
  body('color').optional({ nullable: true }).custom((value: string | null) => {
    if (value !== null && value !== undefined && !isValidColor(value)) {
      throw new Error('Color must be a valid hex color (e.g. #FF5733)');
    }
    return true;
  }),
];

const updateTagValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Tag name max 100 chars'),
  body('color').optional({ nullable: true }).custom((value: string | null) => {
    if (value !== null && value !== undefined && !isValidColor(value)) {
      throw new Error('Color must be a valid hex color (e.g. #FF5733)');
    }
    return true;
  }),
];

const setTagsValidation = [
  body('tagIds').isArray().withMessage('tagIds must be an array'),
  body('tagIds.*').isUUID().withMessage('Each tag ID must be a valid UUID'),
];

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as { page?: string; limit?: string });
  const result = await tagService.findByUser(req.user!.id, params);
  res.json(result);
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const tag = await tagService.findById(req.params.id, req.user!.id);
  res.json(tag);
}));

router.post('/', createTagValidation, asyncHandler(async (req: Request, res: Response) => {
  if (!checkValidation(req, res)) return;

  const tag = await tagService.create(req.body, req.user!.id);
  res.status(201).json(tag);
}));

router.put('/:id', updateTagValidation, asyncHandler(async (req: Request, res: Response) => {
  if (!checkValidation(req, res)) return;

  const tag = await tagService.update(req.params.id, req.body, req.user!.id);
  res.json(tag);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await tagService.delete(req.params.id, req.user!.id);
  res.status(204).send();
}));

router.post('/tasks/:taskId', setTagsValidation, asyncHandler(async (req: Request, res: Response) => {
  if (!checkValidation(req, res)) return;

  const { tagIds } = req.body;
  const tags = await tagService.setTagsForTask(req.params.taskId, tagIds, req.user!.id);
  res.json({ data: tags });
}));

router.post('/tasks/:taskId/:tagId', asyncHandler(async (req: Request, res: Response) => {
  await tagService.addTagToTask(req.params.taskId, req.params.tagId, req.user!.id);
  res.status(204).send();
}));

router.delete('/tasks/:taskId/:tagId', asyncHandler(async (req: Request, res: Response) => {
  await tagService.removeTagFromTask(req.params.taskId, req.params.tagId, req.user!.id);
  res.status(204).send();
}));

export default router;
