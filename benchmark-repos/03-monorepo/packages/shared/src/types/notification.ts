import { User } from './user.js';

export interface Notification {
  id: string;
  userId: string;
  user?: User;
  type: NotificationType;
  title: string;
  message: string;
  data: NotificationData;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  expiresAt?: Date;
  actionUrl?: string;
  icon?: string;
  priority: NotificationPriority;
}

export interface NotificationData {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  actorName?: string;
  projectName?: string;
  taskTitle?: string;
  [key: string]: unknown;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationBatch {
  id: string;
  notifications: Notification[];
  createdAt: Date;
  processedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export type NotificationType =
  | 'task_assigned'
  | 'task_completed'
  | 'task_comment'
  | 'task_mention'
  | 'project_invite'
  | 'project_update'
  | 'payment_received'
  | 'payment_failed'
  | 'subscription_expiring'
  | 'system_announcement'
  | 'security_alert';

export type NotificationChannel = 'in_app' | 'email' | 'push' | 'sms';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface CreateNotificationRequest {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Partial<NotificationData>;
  actionUrl?: string;
  priority?: NotificationPriority;
  expiresAt?: Date;
}

export interface NotificationFilter {
  type?: NotificationType[];
  read?: boolean;
  priority?: NotificationPriority[];
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
}

export function createNotification(request: CreateNotificationRequest): Omit<Notification, 'id' | 'createdAt'> {
  return {
    userId: request.userId,
    type: request.type,
    title: request.title,
    message: request.message,
    data: request.data || {},
    read: false,
    priority: request.priority || 'normal',
    actionUrl: request.actionUrl,
    expiresAt: request.expiresAt,
  };
}

export function isNotificationExpired(notification: Notification): boolean {
  if (!notification.expiresAt) return false;
  return new Date(notification.expiresAt) < new Date();
}

export function getNotificationIcon(type: NotificationType): string {
  const icons: Record<NotificationType, string> = {
    task_assigned: '📋',
    task_completed: '✅',
    task_comment: '💬',
    task_mention: '@',
    project_invite: '👥',
    project_update: '📁',
    payment_received: '💰',
    payment_failed: '❌',
    subscription_expiring: '⏰',
    system_announcement: '📢',
    security_alert: '🔒',
  };
  return icons[type] || '🔔';
}

export function groupNotificationsByDate(notifications: Notification[]): Map<string, Notification[]> {
  const groups = new Map<string, Notification[]>();
  for (const notification of notifications) {
    const date = new Date(notification.createdAt).toISOString().split('T')[0];
    const existing = groups.get(date) || [];
    existing.push(notification);
    groups.set(date, existing);
  }
  return groups;
}
