export type OrganizationStatus29 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type OrganizationPriority29 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface OrganizationRecord29 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: OrganizationStatus29;
  priority: OrganizationPriority29;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateOrganizationPayload29 {
  name: string;
  description?: string;
  status?: OrganizationStatus29;
  priority?: OrganizationPriority29;
  tags?: string[];
}
export interface UpdateOrganizationPayload29 {
  name?: string;
  description?: string;
  status?: OrganizationStatus29;
  priority?: OrganizationPriority29;
}
export interface OrganizationListResponse29 {
  data: OrganizationRecord29[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface OrganizationContext29 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}