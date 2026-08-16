export type EventStatus46 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type EventPriority46 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface EventRecord46 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: EventStatus46;
  priority: EventPriority46;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateEventPayload46 {
  name: string;
  description?: string;
  status?: EventStatus46;
  priority?: EventPriority46;
  tags?: string[];
}
export interface UpdateEventPayload46 {
  name?: string;
  description?: string;
  status?: EventStatus46;
  priority?: EventPriority46;
}
export interface EventListResponse46 {
  data: EventRecord46[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface EventContext46 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}