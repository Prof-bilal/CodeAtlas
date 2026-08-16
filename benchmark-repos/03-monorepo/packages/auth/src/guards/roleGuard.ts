import { User, UserRole, hasPermission } from '@monorepo/shared';

export interface RoleGuardOptions {
  allowedRoles: UserRole[];
  requireAll?: boolean;
}

export interface RoleGuardResult {
  allowed: boolean;
  reason?: string;
}

export class RoleGuard {
  private options: RoleGuardOptions;

  constructor(options: RoleGuardOptions) {
    this.options = options;
  }

  check(user: User): RoleGuardResult {
    if (!user) {
      return { allowed: false, reason: 'No user provided' };
    }
    if (user.status !== 'active') {
      return { allowed: false, reason: 'User account is not active' };
    }
    if (this.options.allowedRoles.length === 0) {
      return { allowed: true };
    }
    if (this.options.requireAll) {
      const hasAllRoles = this.options.allowedRoles.every(role => user.role === role);
      if (!hasAllRoles) {
        return {
          allowed: false,
          reason: `User does not have all required roles: ${this.options.allowedRoles.join(', ')}`,
        };
      }
    } else {
      const hasAnyRole = this.options.allowedRoles.includes(user.role);
      if (!hasAnyRole) {
        return {
          allowed: false,
          reason: `User does not have any of the required roles: ${this.options.allowedRoles.join(', ')}`,
        };
      }
    }
    return { allowed: true };
  }

  static requireRole(...roles: UserRole[]): RoleGuard {
    return new RoleGuard({ allowedRoles: roles });
  }

  static requireAdmin(): RoleGuard {
    return new RoleGuard({ allowedRoles: ['admin'] });
  }

  static requireManagerOrAbove(): RoleGuard {
    return new RoleGuard({ allowedRoles: ['admin', 'manager'] });
  }

  static requireMemberOrAbove(): RoleGuard {
    return new RoleGuard({ allowedRoles: ['admin', 'manager', 'member'] });
  }

  static allowAll(): RoleGuard {
    return new RoleGuard({ allowedRoles: [] });
  }
}

export function checkRole(user: User, ...roles: UserRole[]): boolean {
  return roles.includes(user.role);
}

export function requireRole(user: User, ...roles: UserRole[]): void {
  if (!checkRole(user, ...roles)) {
    throw new Error(`Insufficient permissions: one of [${roles.join(', ')}] required`);
  }
}

export function requireAdmin(user: User): void {
  requireRole(user, 'admin');
}

export function requireManagerOrAbove(user: User): void {
  requireRole(user, 'admin', 'manager');
}
