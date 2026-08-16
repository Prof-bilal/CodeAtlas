import { User } from '@monorepo/shared';

export interface Resource {
  id: string;
  ownerId: string;
  organizationId?: string;
  visibility: 'public' | 'private' | 'team';
  members?: ResourceMember[];
}

export interface ResourceMember {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: string[];
}

export interface ResourceGuardResult {
  allowed: boolean;
  reason?: string;
}

export class ResourceGuard {
  check(user: User, resource: Resource, action: string): ResourceGuardResult {
    if (!user) {
      return { allowed: false, reason: 'No user provided' };
    }
    if (user.status !== 'active') {
      return { allowed: false, reason: 'User account is not active' };
    }
    if (user.role === 'admin') {
      return { allowed: true };
    }
    if (resource.visibility === 'public') {
      if (action === 'read') {
        return { allowed: true };
      }
    }
    if (resource.ownerId === user.id) {
      return { allowed: true };
    }
    if (resource.members) {
      const membership = resource.members.find(m => m.userId === user.id);
      if (membership) {
        if (membership.role === 'owner' || membership.role === 'admin') {
          return { allowed: true };
        }
        if (membership.permissions.includes(action) || membership.permissions.includes('*')) {
          return { allowed: true };
        }
        if (action === 'read' && (membership.role === 'member' || membership.role === 'viewer')) {
          return { allowed: true };
        }
      }
    }
    return {
      allowed: false,
      reason: `User does not have ${action} access to this resource`,
    };
  }

  canRead(user: User, resource: Resource): ResourceGuardResult {
    return this.check(user, resource, 'read');
  }

  canWrite(user: User, resource: Resource): ResourceGuardResult {
    return this.check(user, resource, 'write');
  }

  canDelete(user: User, resource: Resource): ResourceGuardResult {
    return this.check(user, resource, 'delete');
  }

  canManage(user: User, resource: Resource): ResourceGuardResult {
    return this.check(user, resource, 'manage');
  }

  static isOwner(user: User, resource: Resource): boolean {
    return resource.ownerId === user.id;
  }

  static isMember(user: User, resource: Resource): boolean {
    return resource.members?.some(m => m.userId === user.id) ?? false;
  }

  static getMembership(user: User, resource: Resource): ResourceMember | undefined {
    return resource.members?.find(m => m.userId === user.id);
  }
}

export function canAccessResource(user: User, resource: Resource, action: string): boolean {
  const guard = new ResourceGuard();
  return guard.check(user, resource, action).allowed;
}

export function isResourceOwner(user: User, resource: Resource): boolean {
  return resource.ownerId === user.id;
}
