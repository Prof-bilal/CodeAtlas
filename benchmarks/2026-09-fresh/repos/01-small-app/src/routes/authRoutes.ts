import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authService } from '../services/authService.js';
import { authenticate } from '../middleware/auth.js';
import { wrapAsync, checkValidation } from './routeHelpers.js';

const router = Router();

const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  body('firstName').trim().isLength({ min: 1, max: 100 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1, max: 100 }).withMessage('Last name is required'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

router.post('/register', registerValidation, wrapAsync(async (req: Request, res: Response) => {
  if (!checkValidation(req, res)) return;

  const { email, password, firstName, lastName } = req.body;
  const result = await authService.register({ email, password, firstName, lastName });
  
  res.status(201).json(result);
}));

router.post('/login', loginValidation, wrapAsync(async (req: Request, res: Response) => {
  if (!checkValidation(req, res)) return;

  const { email, password } = req.body;
  const result = await authService.login({ email, password });
  
  res.json(result);
}));

router.post('/logout', authenticate, wrapAsync(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.substring(7);
    await authService.logout(token);
  }
  
  res.json({ message: 'Logged out successfully' });
}));

router.post('/refresh', wrapAsync(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token is required' });
    return;
  }

  const result = await authService.refreshToken(refreshToken);
  res.json(result);
}));

router.get('/me', authenticate, wrapAsync(async (req: Request, res: Response) => {
  res.json({ user: req.user });
}));

router.post('/change-password', authenticate, wrapAsync(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current and new password are required' });
    return;
  }

  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  res.json({ message: 'Password changed successfully' });
}));

export default router;
