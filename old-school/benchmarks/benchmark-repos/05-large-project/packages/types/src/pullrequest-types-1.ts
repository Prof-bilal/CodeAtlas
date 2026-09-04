export type PullRequestStatus1 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type PullRequestPriority1 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface PullRequestRecord1 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: PullRequestStatus1;
  priority: PullRequestPriority1;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreatePullRequestPayload1 {
  name: string;
  description?: string;
  status?: PullRequestStatus1;
  priority?: PullRequestPriority1;
  tags?: string[];
}
export interface UpdatePullRequestPayload1 {
  name?: string;
  description?: string;
  status?: PullRequestStatus1;
  priority?: PullRequestPriority1;
}
export interface PullRequestListResponse1 {
  data: PullRequestRecord1[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface PullRequestContext1 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}