export type ScheduleStatus41 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type SchedulePriority41 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ScheduleRecord41 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ScheduleStatus41;
  priority: SchedulePriority41;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateSchedulePayload41 {
  name: string;
  description?: string;
  status?: ScheduleStatus41;
  priority?: SchedulePriority41;
  tags?: string[];
}
export interface UpdateSchedulePayload41 {
  name?: string;
  description?: string;
  status?: ScheduleStatus41;
  priority?: SchedulePriority41;
}
export interface ScheduleListResponse41 {
  data: ScheduleRecord41[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ScheduleContext41 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}