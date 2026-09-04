export type SegmentStatus27 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type SegmentPriority27 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface SegmentRecord27 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: SegmentStatus27;
  priority: SegmentPriority27;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateSegmentPayload27 {
  name: string;
  description?: string;
  status?: SegmentStatus27;
  priority?: SegmentPriority27;
  tags?: string[];
}
export interface UpdateSegmentPayload27 {
  name?: string;
  description?: string;
  status?: SegmentStatus27;
  priority?: SegmentPriority27;
}
export interface SegmentListResponse27 {
  data: SegmentRecord27[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface SegmentContext27 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}