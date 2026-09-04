import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { userService } from '../services/userService.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
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

router.get('/', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const users = await userService.getAllUsers({
      limit: parseInt(req.query.limit as string) || 20,
      offset: parseInt(req.query.offset as string) || 0,
      status: req.query.status as string,
    });
    res.json(users);
  } catch (error) {
    logger.error('Error fetching users:', error);
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
      const user = await userService.getUser(req.params.id);
      res.json(user);
    } catch (error) {
      logger.error('Error fetching user:', error);
      res.status(404).json({ error: 'User not found' });
    }
  }
);

router.put('/:id/role',
  authMiddleware,
  adminMiddleware,
  [
    param('id').isUUID(),
    body('role').isIn(['user', 'admin', 'moderator']),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = await userService.updateUserRole(req.params.id, req.body.role);
      res.json(user);
    } catch (error) {
      logger.error('Error updating user role:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.put('/:id/status',
  authMiddleware,
  adminMiddleware,
  [
    param('id').isUUID(),
    body('status').isIn(['active', 'inactive', 'suspended']),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = await userService.updateUserStatus(req.params.id, req.body.status);
      res.json(user);
    } catch (error) {
      logger.error('Error updating user status:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/change-password',
  authMiddleware,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      await userService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Error changing password:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
