export type BranchStatus6 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type BranchPriority6 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface BranchRecord6 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: BranchStatus6;
  priority: BranchPriority6;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateBranchPayload6 {
  name: string;
  description?: string;
  status?: BranchStatus6;
  priority?: BranchPriority6;
  tags?: string[];
}
export interface UpdateBranchPayload6 {
  name?: string;
  description?: string;
  status?: BranchStatus6;
  priority?: BranchPriority6;
}
export interface BranchListResponse6 {
  data: BranchRecord6[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface BranchContext6 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}