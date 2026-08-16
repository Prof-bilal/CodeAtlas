export type OrganizationStatus = 'active' | 'inactive' | 'suspended';
export type OrganizationPlan = 'free' | 'starter' | 'professional' | 'enterprise';
export interface Organization { id: string; name: string; slug: string; description?: string; status: OrganizationStatus; plan: OrganizationPlan; ownerId: string; settings: OrganizationSettings; limits: OrganizationLimits; createdAt: Date; updatedAt: Date; }
export interface OrganizationSettings { defaultRole: string; allowInvites: boolean; requireEmailVerification: boolean; enforceSSO: boolean; sessionTimeout: number; }
export interface OrganizationLimits { maxUsers: number; maxProjects: number; maxStorage: number; maxApiCalls: number; }
export interface OrganizationMember { organizationId: string; userId: string; role: string; joinedAt: Date; status: 'active' | 'inactive'; }
export interface OrganizationAuditLog { id: string; organizationId: string; userId: string; action: string; resource: string; timestamp: Date; }