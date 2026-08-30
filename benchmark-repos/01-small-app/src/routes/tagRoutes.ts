import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { tagService } from '../services/tagService.js';
import { authenticate } from '../middleware/auth.js';
import { isValidColor } from '../models/tag.js';

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

router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const tags = await tagService.findByUser(req.user.id);
    res.json({ data: tags });
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

    const tag = await tagService.findById(req.params.id, req.user.id);
    res.json(tag);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post('/', createTagValidation, async (req: Request, res: Response) => {
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

    const tag = await tagService.create(req.body, req.user.id);
    res.status(201).json(tag);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.put('/:id', updateTagValidation, async (req: Request, res: Response) => {
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

    const tag = await tagService.update(req.params.id, req.body, req.user.id);
    res.json(tag);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await tagService.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post('/tasks/:taskId', setTagsValidation, async (req: Request, res: Response) => {
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

    const { tagIds } = req.body;
    const tags = await tagService.setTagsForTask(req.params.taskId, tagIds, req.user.id);
    res.json({ data: tags });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post('/tasks/:taskId/:tagId', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await tagService.addTagToTask(req.params.taskId, req.params.tagId, req.user.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.delete('/tasks/:taskId/:tagId', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await tagService.removeTagFromTask(req.params.taskId, req.params.tagId, req.user.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

export default router;
