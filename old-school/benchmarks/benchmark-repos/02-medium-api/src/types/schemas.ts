import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.enum(['user', 'admin', 'moderator']),
  status: z.enum(['active', 'inactive', 'suspended']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8).max(128),
  role: z.enum(['user', 'admin', 'moderator']).optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  role: z.enum(['user', 'admin', 'moderator']).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  priority: z.number().min(0).max(10),
  userId: z.string().uuid(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.number().min(0).max(10).optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.number().min(0).max(10).optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

export const PaymentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  status: z.enum(['pending', 'completed', 'failed', 'refunded']),
  paymentMethod: z.string().optional(),
  stripePaymentId: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreatePaymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  paymentMethod: z.string().optional(),
});

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  planId: z.string(),
  status: z.enum(['active', 'canceled', 'past_due', 'unpaid']),
  currentPeriodStart: z.date(),
  currentPeriodEnd: z.date(),
  cancelAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateSubscriptionSchema = z.object({
  planId: z.string(),
  currentPeriodStart: z.string().datetime(),
  currentPeriodEnd: z.string().datetime(),
});

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  message: z.string().optional(),
  read: z.boolean(),
  data: z.any().optional(),
  createdAt: z.date(),
});

export const CreateNotificationSchema = z.object({
  type: z.string(),
  title: z.string(),
  message: z.string().optional(),
  data: z.any().optional(),
});

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  keyHash: z.string(),
  permissions: z.array(z.string()),
  lastUsedAt: z.date().optional(),
  expiresAt: z.date().optional(),
  createdAt: z.date(),
});

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  permissions: z.array(z.string()).optional(),
});

export const WebhookSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(z.string()),
  active: z.boolean(),
  lastTriggeredAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()),
  secret: z.string().optional(),
});

export const FileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  path: z.string(),
  metadata: z.any().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateFileSchema = z.object({
  filename: z.string(),
  originalName: z.string(),
  path: z.string(),
  size: z.number().optional(),
  mimeType: z.string().optional(),
  metadata: z.any().optional(),
});

export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type CreatePayment = z.infer<typeof CreatePaymentSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type CreateSubscription = z.infer<typeof CreateSubscriptionSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type CreateNotification = z.infer<typeof CreateNotificationSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type CreateApiKey = z.infer<typeof CreateApiKeySchema>;
export type Webhook = z.infer<typeof WebhookSchema>;
export type CreateWebhook = z.infer<typeof CreateWebhookSchema>;
export type FileRecord = z.infer<typeof FileSchema>;
export type CreateFile = z.infer<typeof CreateFileSchema>;
