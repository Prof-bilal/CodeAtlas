import { z } from 'zod';

export const createNotificationSchema = z.object({
  type: z.enum(['email', 'push', 'in_app']),
  category: z.enum(['system', 'payment', 'task', 'security', 'marketing']),
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(2000),
  data: z.record(z.any()).optional(),
});

export const notificationFiltersSchema = z.object({
  type: z.enum(['email', 'push', 'in_app']).optional(),
  category: z.enum(['system', 'payment', 'task', 'security', 'marketing']).optional(),
  read: z.boolean().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type NotificationFilters = z.infer<typeof notificationFiltersSchema>;
