export type SessionStatus13 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type SessionPriority13 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface SessionRecord13 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: SessionStatus13;
  priority: SessionPriority13;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateSessionPayload13 {
  name: string;
  description?: string;
  status?: SessionStatus13;
  priority?: SessionPriority13;
  tags?: string[];
}
export interface UpdateSessionPayload13 {
  name?: string;
  description?: string;
  status?: SessionStatus13;
  priority?: SessionPriority13;
}
export interface SessionListResponse13 {
  data: SessionRecord13[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface SessionContext13 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}