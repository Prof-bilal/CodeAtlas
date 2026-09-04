export type ProjectStatus23 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type ProjectPriority23 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ProjectRecord23 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ProjectStatus23;
  priority: ProjectPriority23;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateProjectPayload23 {
  name: string;
  description?: string;
  status?: ProjectStatus23;
  priority?: ProjectPriority23;
  tags?: string[];
}
export interface UpdateProjectPayload23 {
  name?: string;
  description?: string;
  status?: ProjectStatus23;
  priority?: ProjectPriority23;
}
export interface ProjectListResponse23 {
  data: ProjectRecord23[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ProjectContext23 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}