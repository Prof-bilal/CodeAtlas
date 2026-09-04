export type PushStatus58 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type PushPriority58 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface PushRecord58 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: PushStatus58;
  priority: PushPriority58;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreatePushPayload58 {
  name: string;
  description?: string;
  status?: PushStatus58;
  priority?: PushPriority58;
  tags?: string[];
}
export interface UpdatePushPayload58 {
  name?: string;
  description?: string;
  status?: PushStatus58;
  priority?: PushPriority58;
}
export interface PushListResponse58 {
  data: PushRecord58[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface PushContext58 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}