import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { userService } from '../services/userService.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await userService.getUser(req.user.id);
    res.json(user);
  } catch (error) {
    logger.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.put('/profile', 
  authMiddleware,
  [
    body('name').optional().isString().trim(),
    body('email').optional().isEmail().normalizeEmail(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = await userService.updateUser(req.user.id, req.body);
      res.json(user);
    } catch (error) {
      logger.error('Error updating user profile:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.delete('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    await userService.deleteUser(req.user.id);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting user profile:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/:id', 
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = await userService.getUser(req.params.id);
      res.json(user);
    } catch (error) {
      logger.error('Error fetching user:', error);
      res.status(404).json({ error: 'User not found' });
    }
  }
);

export default router;
