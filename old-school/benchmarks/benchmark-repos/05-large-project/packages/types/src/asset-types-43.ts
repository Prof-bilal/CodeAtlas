export type AssetStatus43 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type AssetPriority43 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface AssetRecord43 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: AssetStatus43;
  priority: AssetPriority43;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateAssetPayload43 {
  name: string;
  description?: string;
  status?: AssetStatus43;
  priority?: AssetPriority43;
  tags?: string[];
}
export interface UpdateAssetPayload43 {
  name?: string;
  description?: string;
  status?: AssetStatus43;
  priority?: AssetPriority43;
}
export interface AssetListResponse43 {
  data: AssetRecord43[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface AssetContext43 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}