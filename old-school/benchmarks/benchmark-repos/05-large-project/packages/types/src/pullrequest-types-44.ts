export type PullRequestStatus44 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type PullRequestPriority44 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface PullRequestRecord44 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: PullRequestStatus44;
  priority: PullRequestPriority44;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreatePullRequestPayload44 {
  name: string;
  description?: string;
  status?: PullRequestStatus44;
  priority?: PullRequestPriority44;
  tags?: string[];
}
export interface UpdatePullRequestPayload44 {
  name?: string;
  description?: string;
  status?: PullRequestStatus44;
  priority?: PullRequestPriority44;
}
export interface PullRequestListResponse44 {
  data: PullRequestRecord44[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface PullRequestContext44 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}