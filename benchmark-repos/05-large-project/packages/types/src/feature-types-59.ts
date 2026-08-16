export type FeatureStatus59 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type FeaturePriority59 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface FeatureRecord59 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: FeatureStatus59;
  priority: FeaturePriority59;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateFeaturePayload59 {
  name: string;
  description?: string;
  status?: FeatureStatus59;
  priority?: FeaturePriority59;
  tags?: string[];
}
export interface UpdateFeaturePayload59 {
  name?: string;
  description?: string;
  status?: FeatureStatus59;
  priority?: FeaturePriority59;
}
export interface FeatureListResponse59 {
  data: FeatureRecord59[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface FeatureContext59 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}