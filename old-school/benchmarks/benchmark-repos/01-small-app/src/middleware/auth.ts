import { Request, Response, NextFunction } from 'express';
import { authService, AppError } from '../services/authService.js';
import { UserModel } from '../models/user.js';
import { taskRepository } from '../repositories/taskRepository.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserModel;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.substring(7);
    const user = await authService.verifyToken(token);
    
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export function authorizeTaskOwnerOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role === 'admin') {
    next();
    return;
  }

  const taskId = req.params.id;
  if (!taskId) {
    res.status(400).json({ error: 'Task ID required' });
    return;
  }

  taskRepository.findById(taskId)
    .then(task => {
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      if (task.userId !== req.user!.id) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      next();
    })
    .catch(() => {
      res.status(500).json({ error: 'Internal server error' });
    });
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);
  
  authService.verifyToken(token)
    .then(user => {
      req.user = user;
      next();
    })
    .catch(() => {
      next();
    });
}
