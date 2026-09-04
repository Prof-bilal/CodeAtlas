export type CommentStatus61 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type CommentPriority61 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface CommentRecord61 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: CommentStatus61;
  priority: CommentPriority61;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateCommentPayload61 {
  name: string;
  description?: string;
  status?: CommentStatus61;
  priority?: CommentPriority61;
  tags?: string[];
}
export interface UpdateCommentPayload61 {
  name?: string;
  description?: string;
  status?: CommentStatus61;
  priority?: CommentPriority61;
}
export interface CommentListResponse61 {
  data: CommentRecord61[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface CommentContext61 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}