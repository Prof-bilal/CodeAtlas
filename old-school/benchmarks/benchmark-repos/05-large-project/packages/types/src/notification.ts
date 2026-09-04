export type NotificationType = 'info' | 'warning' | 'error' | 'success' | 'mention' | 'assignment';
export type NotificationChannel = 'email' | 'push' | 'sms' | 'in_app' | 'webhook';
export type NotificationStatus = 'unread' | 'read' | 'archived' | 'deleted';
export interface Notification { id: string; userId: string; type: NotificationType; title: string; body: string; data?: Record<string, unknown>; status: NotificationStatus; channels: NotificationChannel[]; readAt?: Date; createdAt: Date; }
export interface NotificationTemplate { id: string; name: string; type: NotificationType; channels: NotificationChannel[]; body: string; variables: { name: string; type: string; required: boolean; }[]; enabled: boolean; }
export interface NotificationPreference { userId: string; type: NotificationType; channels: NotificationChannel[]; enabled: boolean; frequency: 'immediate' | 'daily' | 'weekly'; }