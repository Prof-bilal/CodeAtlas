import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../../../models/user.js';

type Role = 'user' | 'admin' | 'superadmin';

const ROLE_HIERARCHY: Record<Role, number> = {
  user: 0,
  admin: 1,
  superadmin: 2,
};

export function roleGuard(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userRole = req.user.role as Role;
    const hasRole = allowedRoles.some(role => 
      ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[role]
    );

    if (!hasRole) {
      res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: userRole,
      });
      return;
    }

    next();
  };
}

export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userRole = req.user.role as Role;
    
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[minRole]) {
      res.status(403).json({ 
        error: 'Insufficient permissions',
        required: minRole,
        current: userRole,
      });
      return;
    }

    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'superadmin') {
    res.status(403).json({ 
      error: 'Super admin access required',
      current: req.user.role,
    });
    return;
  }

  next();
}
