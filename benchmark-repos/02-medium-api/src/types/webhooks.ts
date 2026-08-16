export interface WebhookEvent {
  id: string;
  type: string;
  payload: any;
  timestamp: Date;
  source: string;
}

export interface WebhookConfig {
  id: string;
  userId: string;
  url: string;
  secret?: string;
  events: string[];
  active: boolean;
  lastTriggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
  source: string;
}

export interface WebhookResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  duration: number;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  event: string;
  status: number;
  response?: WebhookResponse;
  error?: string;
  createdAt: Date;
}

export interface WebhookTestResult {
  success: boolean;
  statusCode: number;
  duration: number;
  error?: string;
}

export const WEBHOOK_EVENTS = [
  'user.registered',
  'user.updated',
  'user.deleted',
  'task.created',
  'task.updated',
  'task.completed',
  'task.deleted',
  'payment.created',
  'payment.success',
  'payment.failed',
  'payment.refunded',
  'subscription.created',
  'subscription.renewed',
  'subscription.canceled',
  'subscription.upgraded',
  'notification.created',
  'file.uploaded',
  'file.deleted',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENTS[number];
