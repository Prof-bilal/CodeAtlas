export type TriggerStatus19 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type TriggerPriority19 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface TriggerRecord19 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: TriggerStatus19;
  priority: TriggerPriority19;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateTriggerPayload19 {
  name: string;
  description?: string;
  status?: TriggerStatus19;
  priority?: TriggerPriority19;
  tags?: string[];
}
export interface UpdateTriggerPayload19 {
  name?: string;
  description?: string;
  status?: TriggerStatus19;
  priority?: TriggerPriority19;
}
export interface TriggerListResponse19 {
  data: TriggerRecord19[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface TriggerContext19 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}