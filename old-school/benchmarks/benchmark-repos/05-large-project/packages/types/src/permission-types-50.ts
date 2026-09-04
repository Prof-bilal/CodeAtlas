export type PermissionStatus50 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type PermissionPriority50 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface PermissionRecord50 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: PermissionStatus50;
  priority: PermissionPriority50;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreatePermissionPayload50 {
  name: string;
  description?: string;
  status?: PermissionStatus50;
  priority?: PermissionPriority50;
  tags?: string[];
}
export interface UpdatePermissionPayload50 {
  name?: string;
  description?: string;
  status?: PermissionStatus50;
  priority?: PermissionPriority50;
}
export interface PermissionListResponse50 {
  data: PermissionRecord50[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface PermissionContext50 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}