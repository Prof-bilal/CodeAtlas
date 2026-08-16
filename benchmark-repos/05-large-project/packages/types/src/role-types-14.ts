export type RoleStatus14 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type RolePriority14 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface RoleRecord14 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: RoleStatus14;
  priority: RolePriority14;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateRolePayload14 {
  name: string;
  description?: string;
  status?: RoleStatus14;
  priority?: RolePriority14;
  tags?: string[];
}
export interface UpdateRolePayload14 {
  name?: string;
  description?: string;
  status?: RoleStatus14;
  priority?: RolePriority14;
}
export interface RoleListResponse14 {
  data: RoleRecord14[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface RoleContext14 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}