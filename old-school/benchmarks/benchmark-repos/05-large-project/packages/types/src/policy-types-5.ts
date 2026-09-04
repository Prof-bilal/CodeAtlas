export type PolicyStatus5 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type PolicyPriority5 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface PolicyRecord5 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: PolicyStatus5;
  priority: PolicyPriority5;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreatePolicyPayload5 {
  name: string;
  description?: string;
  status?: PolicyStatus5;
  priority?: PolicyPriority5;
  tags?: string[];
}
export interface UpdatePolicyPayload5 {
  name?: string;
  description?: string;
  status?: PolicyStatus5;
  priority?: PolicyPriority5;
}
export interface PolicyListResponse5 {
  data: PolicyRecord5[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface PolicyContext5 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}