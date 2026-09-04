import { Result, Ok, Err } from '@atlas/shared';
export type Permission = 'user:create' | 'user:read' | 'user:update' | 'user:delete' | 'project:create' | 'project:read' | 'project:update' | 'project:delete' | 'task:create' | 'task:read' | 'task:update' | 'admin:access' | 'admin:users' | 'payment:create' | 'payment:read';
export type Role = 'owner' | 'admin' | 'manager' | 'member' | 'viewer' | 'guest';
const HIERARCHY: Record<Role, number> = { owner: 6, admin: 5, manager: 4, member: 3, viewer: 2, guest: 1 };
const DEFAULTS: Record<Role, Permission[]> = {
  owner: ['admin:access','admin:users','user:create','user:read','user:update','user:delete','project:create','project:read','project:update','project:delete','task:create','task:read','task:update','payment:create','payment:read'],
  admin: ['admin:access','admin:users','user:create','user:read','user:update','user:delete','project:create','project:read','project:update','project:delete','task:create','task:read','task:update','payment:read'],
  manager: ['project:create','project:read','project:update','task:create','task:read','task:update','task:delete'],
  member: ['project:read','task:create','task:read','task:update'],
  viewer: ['project:read','task:read'],
  guest: ['project:read'],
};
export class PermissionService {
  getPermissionsForRole(role: Role): Permission[] { return DEFAULTS[role] ?? []; }
  hasPermission(role: Role, perm: Permission): boolean { return this.getPermissionsForRole(role).includes(perm); }
  hasAnyPermission(role: Role, perms: Permission[]): boolean { return perms.some(p => this.hasPermission(role, p)); }
  canAccess(userRole: Role, requiredRole: Role): boolean { return HIERARCHY[userRole] >= HIERARCHY[requiredRole]; }
  getHighestRole(roles: Role[]): Role | null { return roles.length > 0 ? roles.reduce((h, r) => HIERARCHY[r] > HIERARCHY[h] ? r : h) : null; }
}