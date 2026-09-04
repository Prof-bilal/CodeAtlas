export type TaxonomyStatus26 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type TaxonomyPriority26 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface TaxonomyRecord26 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: TaxonomyStatus26;
  priority: TaxonomyPriority26;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateTaxonomyPayload26 {
  name: string;
  description?: string;
  status?: TaxonomyStatus26;
  priority?: TaxonomyPriority26;
  tags?: string[];
}
export interface UpdateTaxonomyPayload26 {
  name?: string;
  description?: string;
  status?: TaxonomyStatus26;
  priority?: TaxonomyPriority26;
}
export interface TaxonomyListResponse26 {
  data: TaxonomyRecord26[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface TaxonomyContext26 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}