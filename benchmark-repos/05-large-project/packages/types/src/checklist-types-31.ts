export type ChecklistStatus31 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type ChecklistPriority31 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ChecklistRecord31 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ChecklistStatus31;
  priority: ChecklistPriority31;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateChecklistPayload31 {
  name: string;
  description?: string;
  status?: ChecklistStatus31;
  priority?: ChecklistPriority31;
  tags?: string[];
}
export interface UpdateChecklistPayload31 {
  name?: string;
  description?: string;
  status?: ChecklistStatus31;
  priority?: ChecklistPriority31;
}
export interface ChecklistListResponse31 {
  data: ChecklistRecord31[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ChecklistContext31 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}