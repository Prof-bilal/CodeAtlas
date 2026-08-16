export type KanbanStatus48 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type KanbanPriority48 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface KanbanRecord48 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: KanbanStatus48;
  priority: KanbanPriority48;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateKanbanPayload48 {
  name: string;
  description?: string;
  status?: KanbanStatus48;
  priority?: KanbanPriority48;
  tags?: string[];
}
export interface UpdateKanbanPayload48 {
  name?: string;
  description?: string;
  status?: KanbanStatus48;
  priority?: KanbanPriority48;
}
export interface KanbanListResponse48 {
  data: KanbanRecord48[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface KanbanContext48 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}