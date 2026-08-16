import { Request, Response, NextFunction } from 'express';

type Permission = 
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'tasks:read'
  | 'tasks:write'
  | 'tasks:delete'
  | 'payments:read'
  | 'payments:write'
  | 'payments:refund'
  | 'notifications:read'
  | 'notifications:write'
  | 'api_keys:read'
  | 'api_keys:write'
  | 'api_keys:delete'
  | 'audit:read'
  | 'subscriptions:read'
  | 'subscriptions:write'
  | 'admin:all';

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  user: [
    'users:read',
    'tasks:read',
    'tasks:write',
    'payments:read',
    'notifications:read',
    'api_keys:read',
    'api_keys:write',
  ],
  admin: [
    'users:read',
    'users:write',
    'tasks:read',
    'tasks:write',
    'tasks:delete',
    'payments:read',
    'payments:write',
    'payments:refund',
    'notifications:read',
    'notifications:write',
    'api_keys:read',
    'api_keys:write',
    'api_keys:delete',
    'audit:read',
    'subscriptions:read',
    'subscriptions:write',
  ],
  superadmin: ['admin:all'],
};

export function permissionGuard(...requiredPermissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userRole = req.user.role;
    const userPermissions = ROLE_PERMISSIONS[userRole] || [];
    
    const hasAllPermissions = requiredPermissions.every(permission => {
      if (userPermissions.includes('admin:all')) {
        return true;
      }
      return userPermissions.includes(permission);
    });

    if (!hasAllPermissions) {
      res.status(403).json({ 
        error: 'Insufficient permissions',
        required: requiredPermissions,
        current: userRole,
      });
      return;
    }

    next();
  };
}

export function checkPermission(permission: Permission, userRole: string): boolean {
  const userPermissions = ROLE_PERMISSIONS[userRole] || [];
  
  if (userPermissions.includes('admin:all')) {
    return true;
  }
  
  return userPermissions.includes(permission);
}

export function getUserPermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}
