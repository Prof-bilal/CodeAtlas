export type ProjectStatus21 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type ProjectPriority21 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ProjectRecord21 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ProjectStatus21;
  priority: ProjectPriority21;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateProjectPayload21 {
  name: string;
  description?: string;
  status?: ProjectStatus21;
  priority?: ProjectPriority21;
  tags?: string[];
}
export interface UpdateProjectPayload21 {
  name?: string;
  description?: string;
  status?: ProjectStatus21;
  priority?: ProjectPriority21;
}
export interface ProjectListResponse21 {
  data: ProjectRecord21[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ProjectContext21 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}