export type ProjectStatus34 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type ProjectPriority34 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ProjectRecord34 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ProjectStatus34;
  priority: ProjectPriority34;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateProjectPayload34 {
  name: string;
  description?: string;
  status?: ProjectStatus34;
  priority?: ProjectPriority34;
  tags?: string[];
}
export interface UpdateProjectPayload34 {
  name?: string;
  description?: string;
  status?: ProjectStatus34;
  priority?: ProjectPriority34;
}
export interface ProjectListResponse34 {
  data: ProjectRecord34[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ProjectContext34 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}