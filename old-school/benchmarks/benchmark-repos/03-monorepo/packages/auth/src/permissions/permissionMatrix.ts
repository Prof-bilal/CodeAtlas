import { UserRole } from '@monorepo/shared';

export interface PermissionMatrix {
  [role: string]: {
    [resource: string]: string[];
  };
}

const DEFAULT_MATRIX: PermissionMatrix = {
  admin: {
    users: ['create', 'read', 'update', 'delete', 'manage'],
    projects: ['create', 'read', 'update', 'delete', 'manage'],
    tasks: ['create', 'read', 'update', 'delete', 'manage'],
    payments: ['read', 'refund', 'manage'],
    settings: ['read', 'update', 'manage'],
    reports: ['view', 'export', 'manage'],
    notifications: ['create', 'read', 'update', 'delete', 'manage'],
    api_keys: ['create', 'read', 'update', 'delete', 'manage'],
    audit_logs: ['read', 'export'],
  },
  manager: {
    users: ['read', 'update'],
    projects: ['create', 'read', 'update', 'delete'],
    tasks: ['create', 'read', 'update', 'delete'],
    payments: ['read'],
    settings: ['read'],
    reports: ['view', 'export'],
    notifications: ['create', 'read', 'update'],
    api_keys: ['create', 'read', 'update', 'delete'],
    audit_logs: ['read'],
  },
  member: {
    users: ['read'],
    projects: ['read', 'update'],
    tasks: ['create', 'read', 'update'],
    payments: [],
    settings: ['read'],
    reports: ['view'],
    notifications: ['read', 'update'],
    api_keys: ['create', 'read', 'update', 'delete'],
    audit_logs: [],
  },
  viewer: {
    users: ['read'],
    projects: ['read'],
    tasks: ['read'],
    payments: [],
    settings: ['read'],
    reports: ['view'],
    notifications: ['read'],
    api_keys: [],
    audit_logs: [],
  },
};

export class PermissionMatrixService {
  private matrix: PermissionMatrix;

  constructor(customMatrix?: Partial<PermissionMatrix>) {
    this.matrix = customMatrix ? { ...DEFAULT_MATRIX, ...customMatrix } : DEFAULT_MATRIX;
  }

  getPermissions(role: UserRole): Record<string, string[]> {
    return this.matrix[role] || {};
  }

  hasPermission(role: UserRole, resource: string, action: string): boolean {
    const rolePermissions = this.matrix[role];
    if (!rolePermissions) return false;
    const resourcePermissions = rolePermissions[resource];
    if (!resourcePermissions) return false;
    return resourcePermissions.includes(action) || resourcePermissions.includes('*');
  }

  canPerformAction(role: UserRole, resource: string, action: string): boolean {
    return this.hasPermission(role, resource, action);
  }

  getRoleResources(role: UserRole): string[] {
    const rolePermissions = this.matrix[role];
    if (!rolePermissions) return [];
    return Object.keys(rolePermissions).filter(
      resource => rolePermissions[resource].length > 0
    );
  }

  getResourceActions(role: UserRole, resource: string): string[] {
    const rolePermissions = this.matrix[role];
    if (!rolePermissions) return [];
    return rolePermissions[resource] || [];
  }

  getRolesWithPermission(resource: string, action: string): UserRole[] {
    return (Object.keys(this.matrix) as UserRole[]).filter(role =>
      this.hasPermission(role, resource, action)
    );
  }

  isHigherRole(role1: UserRole, role2: UserRole): boolean {
    const hierarchy: Record<UserRole, number> = {
      admin: 4,
      manager: 3,
      member: 2,
      viewer: 1,
    };
    return (hierarchy[role1] || 0) > (hierarchy[role2] || 0);
  }

  getRoles(): UserRole[] {
    return Object.keys(this.matrix) as UserRole[];
  }

  updateMatrix(role: UserRole, resource: string, actions: string[]): void {
    if (!this.matrix[role]) {
      this.matrix[role] = {};
    }
    this.matrix[role][resource] = actions;
  }

  toJSON(): PermissionMatrix {
    return { ...this.matrix };
  }

  static fromJSON(json: PermissionMatrix): PermissionMatrixService {
    return new PermissionMatrixService(json);
  }
}
