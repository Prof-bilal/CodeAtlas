export type ChecklistStatus51 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type ChecklistPriority51 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ChecklistRecord51 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ChecklistStatus51;
  priority: ChecklistPriority51;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateChecklistPayload51 {
  name: string;
  description?: string;
  status?: ChecklistStatus51;
  priority?: ChecklistPriority51;
  tags?: string[];
}
export interface UpdateChecklistPayload51 {
  name?: string;
  description?: string;
  status?: ChecklistStatus51;
  priority?: ChecklistPriority51;
}
export interface ChecklistListResponse51 {
  data: ChecklistRecord51[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ChecklistContext51 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}