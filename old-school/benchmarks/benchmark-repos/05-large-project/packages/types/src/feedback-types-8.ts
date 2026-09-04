export type FeedbackStatus8 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type FeedbackPriority8 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface FeedbackRecord8 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: FeedbackStatus8;
  priority: FeedbackPriority8;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateFeedbackPayload8 {
  name: string;
  description?: string;
  status?: FeedbackStatus8;
  priority?: FeedbackPriority8;
  tags?: string[];
}
export interface UpdateFeedbackPayload8 {
  name?: string;
  description?: string;
  status?: FeedbackStatus8;
  priority?: FeedbackPriority8;
}
export interface FeedbackListResponse8 {
  data: FeedbackRecord8[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface FeedbackContext8 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}