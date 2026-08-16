export type TaskStatus22 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type TaskPriority22 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface TaskRecord22 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: TaskStatus22;
  priority: TaskPriority22;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateTaskPayload22 {
  name: string;
  description?: string;
  status?: TaskStatus22;
  priority?: TaskPriority22;
  tags?: string[];
}
export interface UpdateTaskPayload22 {
  name?: string;
  description?: string;
  status?: TaskStatus22;
  priority?: TaskPriority22;
}
export interface TaskListResponse22 {
  data: TaskRecord22[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface TaskContext22 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}