export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  metadata: UserMetadata;
}

export interface UserMetadata {
  timezone: string;
  locale: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: NotificationSettings;
  dashboard: DashboardSettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  frequency: 'instant' | 'daily' | 'weekly';
}

export interface DashboardSettings {
  layout: 'grid' | 'list';
  defaultView: string;
  widgets: string[];
}

export type UserRole = 'admin' | 'manager' | 'member' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';

export interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserRequest {
  name?: string;
  avatar?: string;
  role?: UserRole;
  status?: UserStatus;
  preferences?: Partial<UserPreferences>;
}

export interface UserFilter {
  role?: UserRole[];
  status?: UserStatus[];
  search?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export function isUserActive(user: User): boolean {
  return user.status === 'active';
}

export function hasPermission(user: User, permission: string): boolean {
  const rolePermissions: Record<UserRole, string[]> = {
    admin: ['*'],
    manager: ['read', 'write', 'delete', 'manage_team'],
    member: ['read', 'write'],
    viewer: ['read'],
  };
  const permissions = rolePermissions[user.role] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function getDisplayName(user: User): string {
  return user.name || user.email.split('@')[0];
}

export function formatUserForApi(user: User): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
