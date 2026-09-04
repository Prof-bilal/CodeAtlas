export type TriggerStatus36 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type TriggerPriority36 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface TriggerRecord36 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: TriggerStatus36;
  priority: TriggerPriority36;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateTriggerPayload36 {
  name: string;
  description?: string;
  status?: TriggerStatus36;
  priority?: TriggerPriority36;
  tags?: string[];
}
export interface UpdateTriggerPayload36 {
  name?: string;
  description?: string;
  status?: TriggerStatus36;
  priority?: TriggerPriority36;
}
export interface TriggerListResponse36 {
  data: TriggerRecord36[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface TriggerContext36 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}