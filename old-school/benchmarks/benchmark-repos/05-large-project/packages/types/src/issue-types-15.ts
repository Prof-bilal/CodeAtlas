export type IssueStatus15 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type IssuePriority15 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface IssueRecord15 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: IssueStatus15;
  priority: IssuePriority15;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateIssuePayload15 {
  name: string;
  description?: string;
  status?: IssueStatus15;
  priority?: IssuePriority15;
  tags?: string[];
}
export interface UpdateIssuePayload15 {
  name?: string;
  description?: string;
  status?: IssueStatus15;
  priority?: IssuePriority15;
}
export interface IssueListResponse15 {
  data: IssueRecord15[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface IssueContext15 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}