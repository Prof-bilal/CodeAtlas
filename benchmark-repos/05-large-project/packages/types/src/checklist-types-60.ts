export type ChecklistStatus60 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type ChecklistPriority60 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ChecklistRecord60 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ChecklistStatus60;
  priority: ChecklistPriority60;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateChecklistPayload60 {
  name: string;
  description?: string;
  status?: ChecklistStatus60;
  priority?: ChecklistPriority60;
  tags?: string[];
}
export interface UpdateChecklistPayload60 {
  name?: string;
  description?: string;
  status?: ChecklistStatus60;
  priority?: ChecklistPriority60;
}
export interface ChecklistListResponse60 {
  data: ChecklistRecord60[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ChecklistContext60 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}