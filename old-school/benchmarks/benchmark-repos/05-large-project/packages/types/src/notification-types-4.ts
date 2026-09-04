export type NotificationStatus4 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type NotificationPriority4 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface NotificationRecord4 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: NotificationStatus4;
  priority: NotificationPriority4;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateNotificationPayload4 {
  name: string;
  description?: string;
  status?: NotificationStatus4;
  priority?: NotificationPriority4;
  tags?: string[];
}
export interface UpdateNotificationPayload4 {
  name?: string;
  description?: string;
  status?: NotificationStatus4;
  priority?: NotificationPriority4;
}
export interface NotificationListResponse4 {
  data: NotificationRecord4[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface NotificationContext4 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}