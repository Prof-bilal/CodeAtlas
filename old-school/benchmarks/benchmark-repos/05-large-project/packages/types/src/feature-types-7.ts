export type FeatureStatus7 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type FeaturePriority7 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface FeatureRecord7 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: FeatureStatus7;
  priority: FeaturePriority7;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateFeaturePayload7 {
  name: string;
  description?: string;
  status?: FeatureStatus7;
  priority?: FeaturePriority7;
  tags?: string[];
}
export interface UpdateFeaturePayload7 {
  name?: string;
  description?: string;
  status?: FeatureStatus7;
  priority?: FeaturePriority7;
}
export interface FeatureListResponse7 {
  data: FeatureRecord7[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface FeatureContext7 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}