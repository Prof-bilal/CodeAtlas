// Modern payment module for core
// Wraps PaymentServiceV2 with a simpler interface

import { PaymentServiceV2 } from '../../paymentServiceV2';
import type { Database } from '../../database/connection';
import type { Redis } from '../../integrations/redis';

let paymentService: PaymentServiceV2;

export function initModernPayments(db: Database, redis: Redis) {
  paymentService = new PaymentServiceV2(db, redis);
}

export async function chargeUser(
  userId: string,
  amount: number,
  description: string
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  try {
    const payment = await paymentService.createPaymentIntent(userId, amount, 'usd', description);
    const confirmed = await paymentService.confirmPayment(payment.id);

    if (confirmed.status === 'succeeded') {
      return { success: true, paymentId: confirmed.id };
    }

    return { success: false, error: 'Payment processing failed' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function refundUser(
  paymentId: string,
  amount?: number
): Promise<{ success: boolean; error?: string }> {
  const result = await paymentService.refundPayment(paymentId, amount);
  return { success: result.success, error: result.error };
}

export async function getUserPayments(userId: string) {
  return paymentService.getUserPayments(userId);
}

export async function getUserStats(userId: string) {
  return paymentService.getPaymentStats(userId);
}
