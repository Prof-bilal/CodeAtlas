export type BacklogStatus38 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type BacklogPriority38 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface BacklogRecord38 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: BacklogStatus38;
  priority: BacklogPriority38;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateBacklogPayload38 {
  name: string;
  description?: string;
  status?: BacklogStatus38;
  priority?: BacklogPriority38;
  tags?: string[];
}
export interface UpdateBacklogPayload38 {
  name?: string;
  description?: string;
  status?: BacklogStatus38;
  priority?: BacklogPriority38;
}
export interface BacklogListResponse38 {
  data: BacklogRecord38[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface BacklogContext38 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}