export type SessionStatus17 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type SessionPriority17 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface SessionRecord17 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: SessionStatus17;
  priority: SessionPriority17;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateSessionPayload17 {
  name: string;
  description?: string;
  status?: SessionStatus17;
  priority?: SessionPriority17;
  tags?: string[];
}
export interface UpdateSessionPayload17 {
  name?: string;
  description?: string;
  status?: SessionStatus17;
  priority?: SessionPriority17;
}
export interface SessionListResponse17 {
  data: SessionRecord17[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface SessionContext17 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}