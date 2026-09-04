import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { userService } from '../services/userService.js';
import { authRateLimit } from '../middleware/rateLimit.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.post('/register',
  authRateLimit,
  [
    body('email').isEmail().normalizeEmail(),
    body('name').isString().trim().notEmpty(),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = await userService.createUser(req.body);
      res.status(201).json({ user });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/login',
  authRateLimit,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { user, token } = await userService.authenticate(req.body.email, req.body.password);
      res.json({ user, token });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(401).json({ error: 'Invalid credentials' });
    }
  }
);

router.post('/refresh',
  [
    body('token').notEmpty(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { token } = await userService.refreshToken(req.body.token);
      res.json({ token });
    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  }
);

export default router;
