export type IssueStatus11 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type IssuePriority11 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface IssueRecord11 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: IssueStatus11;
  priority: IssuePriority11;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateIssuePayload11 {
  name: string;
  description?: string;
  status?: IssueStatus11;
  priority?: IssuePriority11;
  tags?: string[];
}
export interface UpdateIssuePayload11 {
  name?: string;
  description?: string;
  status?: IssueStatus11;
  priority?: IssuePriority11;
}
export interface IssueListResponse11 {
  data: IssueRecord11[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface IssueContext11 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}