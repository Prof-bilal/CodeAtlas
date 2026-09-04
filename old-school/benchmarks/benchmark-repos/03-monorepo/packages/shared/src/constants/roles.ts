export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: [
    'users.create', 'users.read', 'users.update', 'users.delete',
    'projects.create', 'projects.read', 'projects.update', 'projects.delete',
    'tasks.create', 'tasks.read', 'tasks.update', 'tasks.delete',
    'payments.read', 'payments.refund', 'payments.manage',
    'settings.read', 'settings.update',
    'reports.view', 'reports.export',
    'admin.access',
  ],
  manager: [
    'projects.create', 'projects.read', 'projects.update',
    'tasks.create', 'tasks.read', 'tasks.update', 'tasks.delete',
    'users.read',
    'reports.view', 'reports.export',
  ],
  member: [
    'projects.read',
    'tasks.create', 'tasks.read', 'tasks.update',
    'users.read',
  ],
  viewer: [
    'projects.read',
    'tasks.read',
    'users.read',
  ],
};

export function hasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasRoleOrHigher(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
}

export function getRolePermissions(role: Role): string[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function getAllPermissions(): string[] {
  const permissions = new Set<string>();
  for (const role of Object.values(ROLES)) {
    for (const perm of ROLE_PERMISSIONS[role]) {
      permissions.add(perm);
    }
  }
  return Array.from(permissions);
}
