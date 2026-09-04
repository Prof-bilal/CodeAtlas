export interface NotificationModel {
  id: string;
  userId: string;
  type: 'email' | 'push' | 'in_app';
  category: 'system' | 'payment' | 'task' | 'security' | 'marketing';
  title: string;
  message: string;
  data: Record<string, any> | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface CreateNotificationInput {
  userId: string;
  type: 'email' | 'push' | 'in_app';
  category: 'system' | 'payment' | 'task' | 'security' | 'marketing';
  title: string;
  message: string;
  data?: Record<string, any>;
}

export interface NotificationResponse {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  data: Record<string, any> | null;
  readAt: Date | null;
  createdAt: Date;
}

export function toNotificationResponse(notification: NotificationModel): NotificationResponse {
  return {
    id: notification.id,
    type: notification.type,
    category: notification.category,
    title: notification.title,
    message: notification.message,
    data: notification.data,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}
