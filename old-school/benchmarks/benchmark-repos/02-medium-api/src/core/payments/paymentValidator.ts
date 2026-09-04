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

export const webhookEventSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.any(),
  }),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
