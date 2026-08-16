export type TaskStatus12 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type TaskPriority12 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface TaskRecord12 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: TaskStatus12;
  priority: TaskPriority12;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateTaskPayload12 {
  name: string;
  description?: string;
  status?: TaskStatus12;
  priority?: TaskPriority12;
  tags?: string[];
}
export interface UpdateTaskPayload12 {
  name?: string;
  description?: string;
  status?: TaskStatus12;
  priority?: TaskPriority12;
}
export interface TaskListResponse12 {
  data: TaskRecord12[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface TaskContext12 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}