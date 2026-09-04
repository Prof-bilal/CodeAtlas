// Payment Service V2 - async/await based
// Current production implementation
// Last updated: 2024-03-15

import Stripe from 'stripe';
import type { Database } from './database/connection';
import type { Redis } from './integrations/redis';
import { Logger } from './utils';
import { v4 as uuidv4 } from 'uuid';

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

interface PaymentV2 {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  description: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  refundAmount: number;
  metadata: Record<string, unknown>;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RefundResult {
  success: boolean;
  refundId?: string;
  error?: string;
}

interface PaymentStats {
  totalPayments: number;
  totalAmount: number;
  successfulPayments: number;
  failedPayments: number;
  refundedAmount: number;
}

export class PaymentServiceV2 {
  private db: Database;
  private redis: Redis;

  constructor(db: Database, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  async createPaymentIntent(
    userId: string,
    amount: number,
    currency: string = 'usd',
    description: string = '',
    idempotencyKey?: string
  ): Promise<PaymentV2> {
    const id = uuidv4();
    const key = idempotencyKey || uuidv4();

    // Check for duplicate
    const existing = await this.redis.get(`payment_idempotent:${key}`);
    if (existing) {
      return JSON.parse(existing) as PaymentV2;
    }

    const payment: PaymentV2 = {
      id,
      userId,
      amount,
      currency,
      description,
      status: 'pending',
      stripePaymentIntentId: null,
      stripeChargeId: null,
      refundAmount: 0,
      metadata: {},
      idempotencyKey: key,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.db.query(
      `INSERT INTO payments_v2 (id, user_id, amount, currency, description, status, refund_amount, metadata, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payment.id, payment.userId, payment.amount, payment.currency,
       payment.description, payment.status, payment.refundAmount,
       JSON.stringify(payment.metadata), payment.idempotencyKey,
       payment.createdAt.toISOString(), payment.updatedAt.toISOString()]
    );

    await this.redis.setex(`payment_idempotent:${key}`, 86400, JSON.stringify(payment));
    await this.redis.setex(`payment:${id}`, 3600, JSON.stringify(payment));

    Logger.info(`Payment intent created: ${id} for user ${userId}`);

    return payment;
  }

  async confirmPayment(paymentId: string): Promise<PaymentV2> {
    const payment = await this.getPayment(paymentId);
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'pending') throw new Error('Payment is not pending');

    await this.updateStatus(paymentId, 'processing');

    try {
      const pi = await stripeClient.paymentIntents.create({
        amount: Math.round(payment.amount * 100),
        currency: payment.currency,
        description: payment.description,
        metadata: { paymentId, userId: payment.userId },
      });

      payment.stripePaymentIntentId = pi.id;

      if (pi.status === 'succeeded') {
        payment.status = 'succeeded';
        payment.stripeChargeId = pi.latest_charge as string;
      } else {
        payment.status = 'failed';
      }
    } catch (err: any) {
      payment.status = 'failed';
      Logger.error(`Payment ${paymentId} confirmation failed:`, err.message);
    }

    payment.updatedAt = new Date();
    await this.savePayment(payment);

    return payment;
  }

  async refundPayment(paymentId: string, amount?: number): Promise<RefundResult> {
    const payment = await this.getPayment(paymentId);
    if (!payment) return { success: false, error: 'Payment not found' };
    if (payment.status !== 'succeeded') return { success: false, error: 'Payment not succeeded' };

    const refundAmount = amount || payment.amount;

    if (refundAmount > payment.amount - payment.refundAmount) {
      return { success: false, error: 'Refund amount exceeds available amount' };
    }

    try {
      const refund = await stripeClient.refunds.create({
        payment_intent: payment.stripePaymentIntentId!,
        amount: Math.round(refundAmount * 100),
      });

      payment.refundAmount += refundAmount;
      payment.status = payment.refundAmount >= payment.amount ? 'refunded' : 'partially_refunded';
      payment.updatedAt = new Date();
      await this.savePayment(payment);

      Logger.info(`Refund processed: ${refund.id} for payment ${paymentId}`);

      return { success: true, refundId: refund.id };
    } catch (err: any) {
      Logger.error(`Refund failed for payment ${paymentId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async getPayment(id: string): Promise<PaymentV2 | null> {
    const cached = await this.redis.get(`payment:${id}`);
    if (cached) return JSON.parse(cached) as PaymentV2;

    const results = await this.db.query(
      'SELECT * FROM payments_v2 WHERE id = ?',
      [id]
    ) as any[];

    if (results.length === 0) return null;

    return this.mapRowToPayment(results[0]);
  }

  async getUserPayments(userId: string, page: number = 1, limit: number = 20): Promise<PaymentV2[]> {
    const offset = (page - 1) * limit;
    const results = await this.db.query(
      'SELECT * FROM payments_v2 WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    ) as any[];

    return results.map(this.mapRowToPayment);
  }

  async getPaymentStats(userId: string): Promise<PaymentStats> {
    const results = await this.db.query(
      `SELECT
         COUNT(*) as total_payments,
         COALESCE(SUM(amount), 0) as total_amount,
         SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as successful,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         COALESCE(SUM(refund_amount), 0) as refunded
       FROM payments_v2 WHERE user_id = ?`,
      [userId]
    ) as any[];

    const row = results[0];
    return {
      totalPayments: row.total_payments,
      totalAmount: row.total_amount,
      successfulPayments: row.successful,
      failedPayments: row.failed,
      refundedAmount: row.refunded,
    };
  }

  private async updateStatus(id: string, status: PaymentV2['status']): Promise<void> {
    await this.db.query(
      'UPDATE payments_v2 SET status = ?, updated_at = ? WHERE id = ?',
      [status, new Date().toISOString(), id]
    );
    await this.redis.del(`payment:${id}`);
  }

  private async savePayment(payment: PaymentV2): Promise<void> {
    await this.db.query(
      `UPDATE payments_v2 SET status = ?, stripe_payment_intent_id = ?, stripe_charge_id = ?,
       refund_amount = ?, metadata = ?, updated_at = ? WHERE id = ?`,
      [payment.status, payment.stripePaymentIntentId, payment.stripeChargeId,
       payment.refundAmount, JSON.stringify(payment.metadata),
       payment.updatedAt.toISOString(), payment.id]
    );
    await this.redis.del(`payment:${payment.id}`);
  }

  private mapRowToPayment(row: any): PaymentV2 {
    return {
      id: row.id,
      userId: row.user_id,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      status: row.status,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      stripeChargeId: row.stripe_charge_id,
      refundAmount: row.refund_amount,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      idempotencyKey: row.idempotency_key,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
