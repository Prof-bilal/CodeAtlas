export type SegmentStatus35 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type SegmentPriority35 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface SegmentRecord35 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: SegmentStatus35;
  priority: SegmentPriority35;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateSegmentPayload35 {
  name: string;
  description?: string;
  status?: SegmentStatus35;
  priority?: SegmentPriority35;
  tags?: string[];
}
export interface UpdateSegmentPayload35 {
  name?: string;
  description?: string;
  status?: SegmentStatus35;
  priority?: SegmentPriority35;
}
export interface SegmentListResponse35 {
  data: SegmentRecord35[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface SegmentContext35 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}