export type PushStatus42 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type PushPriority42 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface PushRecord42 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: PushStatus42;
  priority: PushPriority42;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreatePushPayload42 {
  name: string;
  description?: string;
  status?: PushStatus42;
  priority?: PushPriority42;
  tags?: string[];
}
export interface UpdatePushPayload42 {
  name?: string;
  description?: string;
  status?: PushStatus42;
  priority?: PushPriority42;
}
export interface PushListResponse42 {
  data: PushRecord42[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface PushContext42 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}