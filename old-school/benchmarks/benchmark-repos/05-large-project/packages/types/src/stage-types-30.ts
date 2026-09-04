export type StageStatus30 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type StagePriority30 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface StageRecord30 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: StageStatus30;
  priority: StagePriority30;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateStagePayload30 {
  name: string;
  description?: string;
  status?: StageStatus30;
  priority?: StagePriority30;
  tags?: string[];
}
export interface UpdateStagePayload30 {
  name?: string;
  description?: string;
  status?: StageStatus30;
  priority?: StagePriority30;
}
export interface StageListResponse30 {
  data: StageRecord30[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface StageContext30 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}