import { User, UserRole } from '@monorepo/shared';
import { PermissionMatrixService } from './permissionMatrix.js';

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  missingPermissions?: string[];
}

export interface ResourcePermission {
  resource: string;
  action: string;
}

export class PermissionChecker {
  private matrixService: PermissionMatrixService;

  constructor(matrixService?: PermissionMatrixService) {
    this.matrixService = matrixService || new PermissionMatrixService();
  }

  check(user: User, resource: string, action: string): PermissionCheckResult {
    if (!user) {
      return { allowed: false, reason: 'No user provided' };
    }
    if (user.status !== 'active') {
      return { allowed: false, reason: 'User account is not active' };
    }
    const allowed = this.matrixService.hasPermission(user.role, resource, action);
    if (allowed) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Role '${user.role}' does not have '${action}' permission on '${resource}'`,
      missingPermissions: [`${resource}.${action}`],
    };
  }

  checkMultiple(user: User, permissions: ResourcePermission[]): PermissionCheckResult {
    const missing: string[] = [];
    for (const perm of permissions) {
      const result = this.check(user, perm.resource, perm.action);
      if (!result.allowed) {
        missing.push(`${perm.resource}.${perm.action}`);
      }
    }
    if (missing.length === 0) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Missing permissions: ${missing.join(', ')}`,
      missingPermissions: missing,
    };
  }

  checkAny(user: User, permissions: ResourcePermission[]): PermissionCheckResult {
    for (const perm of permissions) {
      const result = this.check(user, perm.resource, perm.action);
      if (result.allowed) {
        return { allowed: true };
      }
    }
    return {
      allowed: false,
      reason: 'None of the required permissions are satisfied',
      missingPermissions: permissions.map(p => `${p.resource}.${p.action}`),
    };
  }

  getUserPermissions(user: User): Record<string, string[]> {
    return this.matrixService.getPermissions(user.role);
  }

  getUserResourcePermissions(user: User, resource: string): string[] {
    return this.matrixService.getResourceActions(user.role, resource);
  }

  canAccessResource(user: User, resource: string): boolean {
    const permissions = this.getUserResourcePermissions(user, resource);
    return permissions.length > 0;
  }

  getRequiredRoles(resource: string, action: string): UserRole[] {
    return this.matrixService.getRolesWithPermission(resource, action);
  }

  hasMinimumRole(user: User, resource: string, action: string): boolean {
    return this.matrixService.hasPermission(user.role, resource, action);
  }

  explain(user: User, resource: string, action: string): string {
    const result = this.check(user, resource, action);
    if (result.allowed) {
      return `User '${user.email}' (role: ${user.role}) is allowed to '${action}' on '${resource}'`;
    }
    return `User '${user.email}' (role: ${user.role}) is NOT allowed to '${action}' on '${resource}'. ${result.reason}`;
  }
}

export function createPermissionChecker(matrixService?: PermissionMatrixService): PermissionChecker {
  return new PermissionChecker(matrixService);
}

export function checkUserPermission(
  user: User,
  resource: string,
  action: string,
  matrixService?: PermissionMatrixService
): PermissionCheckResult {
  const checker = new PermissionChecker(matrixService);
  return checker.check(user, resource, action);
}
