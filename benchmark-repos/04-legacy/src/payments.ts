// Basic payment processing
// DEPRECATED 2023-11 - use paymentServiceV2.ts or paymentsNew.ts
// TODO: remove after migrating all Stripe webhooks

import { stripe } from './integrations/stripe';
import { Database } from './database/connection';
import { Logger } from './utils';

interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  stripePaymentId?: string;
  createdAt: Date;
}

interface Invoice {
  id: string;
  userId: string;
  paymentId: string;
  amount: number;
  description: string;
  paidAt: Date;
}

export async function createPayment(
  userId: string,
  amount: number,
  currency: string = 'usd'
): Promise<Payment> {
  Logger.info(`Creating payment: ${amount} ${currency} for user ${userId}`);

  const payment: Payment = {
    id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    amount,
    currency,
    status: 'pending',
    createdAt: new Date(),
  };

  // Try to charge via Stripe
  try {
    const charge = await stripe.charges.create({
      amount: Math.round(amount * 100),
      currency,
      description: `Payment for user ${userId}`,
    });

    payment.stripePaymentId = charge.id;
    payment.status = 'completed';
  } catch (err) {
    Logger.error('Stripe charge failed:', err);
    payment.status = 'failed';
  }

  return payment;
}

export async function getPayment(id: string): Promise<Payment | null> {
  // TODO: implement proper database lookup
  return null;
}

export async function refundPayment(id: string): Promise<boolean> {
  Logger.warn(`Refund requested for ${id} - not implemented in basic version`);
  return false;
}

export async function getPaymentsByUser(userId: string): Promise<Payment[]> {
  Logger.info(`Getting payments for user ${userId}`);
  return [];
}
