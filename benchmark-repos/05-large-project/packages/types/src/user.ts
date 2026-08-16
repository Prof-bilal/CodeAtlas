export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending_verification' | 'deactivated';
export type UserRole = 'owner' | 'admin' | 'member' | 'viewer' | 'guest';
export type AuthProvider = 'email' | 'google' | 'github' | 'microsoft' | 'saml';
export interface User { id: string; uuid: string; email: string; firstName: string; lastName: string; displayName: string; avatarUrl?: string; status: UserStatus; roles: UserRole[]; organizationIds: string[]; authProvider: AuthProvider; emailVerified: boolean; twoFactorEnabled: boolean; lastLoginAt?: Date; createdAt: Date; updatedAt: Date; metadata: Record<string, unknown>; }
export interface CreateUserRequest { email: string; password?: string; firstName: string; lastName: string; }
export interface UpdateUserRequest { firstName?: string; lastName?: string; displayName?: string; avatarUrl?: string; }
export interface UserPreferences { userId: string; timezone: string; locale: string; theme: 'light' | 'dark' | 'system'; notifications: NotificationPreferences; }
export interface NotificationPreferences { email: boolean; push: boolean; sms: boolean; inApp: boolean; digest: 'daily' | 'weekly' | 'never'; }
export interface UserSession { userId: string; sessionId: string; token: string; expiresAt: Date; ip: string; lastActivityAt: Date; }
export interface UserProfile { userId: string; bio?: string; location?: string; website?: string; company?: string; skills: string[]; timezone: string; }