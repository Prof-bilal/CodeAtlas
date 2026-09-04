export type IntegrationStatus3 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type IntegrationPriority3 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface IntegrationRecord3 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: IntegrationStatus3;
  priority: IntegrationPriority3;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateIntegrationPayload3 {
  name: string;
  description?: string;
  status?: IntegrationStatus3;
  priority?: IntegrationPriority3;
  tags?: string[];
}
export interface UpdateIntegrationPayload3 {
  name?: string;
  description?: string;
  status?: IntegrationStatus3;
  priority?: IntegrationPriority3;
}
export interface IntegrationListResponse3 {
  data: IntegrationRecord3[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface IntegrationContext3 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}