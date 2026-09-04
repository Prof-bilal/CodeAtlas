import { Request, Response } from 'express';
import { userService } from '../services/userService.js';
import { logger } from '../utils/logger.js';

export class UserController {
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const user = await userService.getUser(req.user.id);
      res.json(user);
    } catch (error) {
      logger.error('Error fetching user profile:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const user = await userService.updateUser(req.user.id, req.body);
      res.json(user);
    } catch (error) {
      logger.error('Error updating user profile:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async deleteProfile(req: Request, res: Response): Promise<void> {
    try {
      await userService.deleteUser(req.user.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting user profile:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getUsers(req: Request, res: Response): Promise<void> {
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
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const user = await userService.getUser(req.params.id);
      res.json(user);
    } catch (error) {
      logger.error('Error fetching user:', error);
      res.status(404).json({ error: 'User not found' });
    }
  }

  async updateRole(req: Request, res: Response): Promise<void> {
    try {
      const user = await userService.updateUserRole(req.params.id, req.body.role);
      res.json(user);
    } catch (error) {
      logger.error('Error updating user role:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const user = await userService.updateUserStatus(req.params.id, req.body.status);
      res.json(user);
    } catch (error) {
      logger.error('Error updating user status:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      await userService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Error changing password:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export const userController = new UserController();
