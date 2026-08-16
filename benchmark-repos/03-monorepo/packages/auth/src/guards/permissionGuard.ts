import { User } from '@monorepo/shared';
import { ROLE_PERMISSIONS, Role } from '@monorepo/shared';

export interface Permission {
  resource: string;
  action: string;
}

export interface PermissionGuardResult {
  allowed: boolean;
  reason?: string;
}

export class PermissionGuard {
  private requiredPermissions: Permission[];
  private requireAll: boolean;

  constructor(requiredPermissions: Permission[], requireAll: boolean = true) {
    this.requiredPermissions = requiredPermissions;
    this.requireAll = requireAll;
  }

  check(user: User): PermissionGuardResult {
    if (!user) {
      return { allowed: false, reason: 'No user provided' };
    }
    if (user.status !== 'active') {
      return { allowed: false, reason: 'User account is not active' };
    }
    const userPermissions = ROLE_PERMISSIONS[user.role] || [];
    const hasWildcard = userPermissions.includes('*');
    if (hasWildcard) {
      return { allowed: true };
    }
    if (this.requireAll) {
      const hasAll = this.requiredPermissions.every(perm => {
        const permString = `${perm.resource}.${perm.action}`;
        return userPermissions.includes(permString);
      });
      if (!hasAll) {
        return {
          allowed: false,
          reason: `Missing required permissions: ${this.requiredPermissions.map(p => `${p.resource}.${p.action}`).join(', ')}`,
        };
      }
    } else {
      const hasAny = this.requiredPermissions.some(perm => {
        const permString = `${perm.resource}.${perm.action}`;
        return userPermissions.includes(permString);
      });
      if (!hasAny) {
        return {
          allowed: false,
          reason: `Missing any of the required permissions: ${this.requiredPermissions.map(p => `${p.resource}.${p.action}`).join(', ')}`,
        };
      }
    }
    return { allowed: true };
  }

  static require(resource: string, action: string): PermissionGuard {
    return new PermissionGuard([{ resource, action }]);
  }

  static requireAny(...permissions: Permission[]): PermissionGuard {
    return new PermissionGuard(permissions, false);
  }

  static requireAll(...permissions: Permission[]): PermissionGuard {
    return new PermissionGuard(permissions, true);
  }

  static requireProjectAccess(action: string): PermissionGuard {
    return new PermissionGuard([{ resource: 'projects', action }]);
  }

  static requireTaskAccess(action: string): PermissionGuard {
    return new PermissionGuard([{ resource: 'tasks', action }]);
  }

  static requireUserAccess(action: string): PermissionGuard {
    return new PermissionGuard([{ resource: 'users', action }]);
  }
}

export function hasPermission(user: User, permission: string): boolean {
  const userPermissions = ROLE_PERMISSIONS[user.role] || [];
  return userPermissions.includes('*') || userPermissions.includes(permission);
}

export function requirePermission(user: User, permission: string): void {
  if (!hasPermission(user, permission)) {
    throw new Error(`Insufficient permissions: ${permission} required`);
  }
}

export function getUserPermissions(user: User): string[] {
  return ROLE_PERMISSIONS[user.role] || [];
}
