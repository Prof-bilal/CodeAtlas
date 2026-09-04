import { z } from 'zod';

export const createPaymentSchema = z.object({
  amount: z.number().int().positive().max(1000000),
  currency: z.string().length(3).optional(),
  description: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

export const refundPaymentSchema = z.object({
  amount: z.number().int().positive().optional(),
});

export const paymentFiltersSchema = z.object({
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
export type PaymentFilters = z.infer<typeof paymentFiltersSchema>;
