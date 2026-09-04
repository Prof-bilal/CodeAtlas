export type IssueStatus53 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type IssuePriority53 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface IssueRecord53 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: IssueStatus53;
  priority: IssuePriority53;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateIssuePayload53 {
  name: string;
  description?: string;
  status?: IssueStatus53;
  priority?: IssuePriority53;
  tags?: string[];
}
export interface UpdateIssuePayload53 {
  name?: string;
  description?: string;
  status?: IssueStatus53;
  priority?: IssuePriority53;
}
export interface IssueListResponse53 {
  data: IssueRecord53[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface IssueContext53 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}