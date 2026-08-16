export type MessageStatus45 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type MessagePriority45 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface MessageRecord45 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: MessageStatus45;
  priority: MessagePriority45;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateMessagePayload45 {
  name: string;
  description?: string;
  status?: MessageStatus45;
  priority?: MessagePriority45;
  tags?: string[];
}
export interface UpdateMessagePayload45 {
  name?: string;
  description?: string;
  status?: MessageStatus45;
  priority?: MessagePriority45;
}
export interface MessageListResponse45 {
  data: MessageRecord45[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface MessageContext45 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}