export type DeploymentStatus18 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type DeploymentPriority18 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface DeploymentRecord18 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: DeploymentStatus18;
  priority: DeploymentPriority18;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateDeploymentPayload18 {
  name: string;
  description?: string;
  status?: DeploymentStatus18;
  priority?: DeploymentPriority18;
  tags?: string[];
}
export interface UpdateDeploymentPayload18 {
  name?: string;
  description?: string;
  status?: DeploymentStatus18;
  priority?: DeploymentPriority18;
}
export interface DeploymentListResponse18 {
  data: DeploymentRecord18[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface DeploymentContext18 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}