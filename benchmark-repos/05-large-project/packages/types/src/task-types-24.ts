export type TaskStatus24 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type TaskPriority24 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface TaskRecord24 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: TaskStatus24;
  priority: TaskPriority24;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateTaskPayload24 {
  name: string;
  description?: string;
  status?: TaskStatus24;
  priority?: TaskPriority24;
  tags?: string[];
}
export interface UpdateTaskPayload24 {
  name?: string;
  description?: string;
  status?: TaskStatus24;
  priority?: TaskPriority24;
}
export interface TaskListResponse24 {
  data: TaskRecord24[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface TaskContext24 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}