export type BugStatus32 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type BugPriority32 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface BugRecord32 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: BugStatus32;
  priority: BugPriority32;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateBugPayload32 {
  name: string;
  description?: string;
  status?: BugStatus32;
  priority?: BugPriority32;
  tags?: string[];
}
export interface UpdateBugPayload32 {
  name?: string;
  description?: string;
  status?: BugStatus32;
  priority?: BugPriority32;
}
export interface BugListResponse32 {
  data: BugRecord32[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface BugContext32 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}