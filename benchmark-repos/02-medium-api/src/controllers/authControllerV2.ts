import { Request, Response } from 'express';
import { userService } from '../services/userService.js';
import { logger } from '../utils/logger.js';

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const user = await userService.createUser(req.body);
      res.status(201).json({ user });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { user, token } = await userService.authenticate(req.body.email, req.body.password);
      res.json({ user, token });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(401).json({ error: 'Invalid credentials' });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { token } = await userService.refreshToken(req.body.token);
      res.json({ token });
    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      await userService.forgotPassword(req.body.email);
      res.json({ message: 'Password reset email sent' });
    } catch (error) {
      logger.error('Forgot password error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      await userService.resetPassword(req.body.token, req.body.password);
      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      await userService.verifyEmail(req.body.token);
      res.json({ message: 'Email verified successfully' });
    } catch (error) {
      logger.error('Email verification error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export const authController = new AuthController();
