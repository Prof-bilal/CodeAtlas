// Newest payment implementation - DO NOT USE YET
// This is being developed for the v4 payment system
// Expected launch: Q3 2024

import Stripe from 'stripe';
import type { Database } from './database/connection';
import type { Redis } from './integrations/redis';
import { Logger } from './utils';
import { EventEmitter } from 'events';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export interface PaymentNew {
  id: string;
  userId: string;
  organizationId: string | null;
  amount: number;
  currency: string;
  description: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerPaymentId: string | null;
  providerCustomerId: string | null;
  refundAmount: number;
  taxAmount: number;
  feeAmount: number;
  netAmount: number;
  metadata: Record<string, unknown>;
  items: PaymentItem[];
  attempts: PaymentAttempt[];
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'requires_action'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed'
  | 'expired';

export type PaymentProvider = 'stripe' | 'paypal' | 'manual';

export interface PaymentItem {
  description: string;
  amount: number;
  quantity: number;
  metadata?: Record<string, unknown>;
}

export interface PaymentAttempt {
  id: string;
  status: string;
  error?: string;
  createdAt: Date;
}

export interface CreatePaymentInput {
  userId: string;
  organizationId?: string;
  amount: number;
  currency?: string;
  description: string;
  items?: PaymentItem[];
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export class PaymentsNew extends EventEmitter {
  private db: Database;
  private redis: Redis;

  constructor(db: Database, redis: Redis) {
    super();
    this.db = db;
    this.redis = redis;
  }

  async create(input: CreatePaymentInput): Promise<PaymentNew> {
    const id = this.generateId();
    const key = input.idempotencyKey || id;

    const existing = await this.getIdempotent(key);
    if (existing) return existing;

    const totalItemAmount = input.items?.reduce(
      (sum, item) => sum + item.amount * item.quantity, 0
    ) || input.amount;

    if (Math.abs(totalItemAmount - input.amount) > 0.01) {
      throw new Error('Item total does not match payment amount');
    }

    const payment: PaymentNew = {
      id,
      userId: input.userId,
      organizationId: input.organizationId || null,
      amount: input.amount,
      currency: input.currency || 'usd',
      description: input.description,
      status: 'pending',
      provider: 'stripe',
      providerPaymentId: null,
      providerCustomerId: null,
      refundAmount: 0,
      taxAmount: 0,
      feeAmount: 0,
      netAmount: input.amount,
      metadata: input.metadata || {},
      items: input.items || [],
      attempts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };

    await this.save(payment);
    await this.setIdempotent(key, payment);

    this.emit('payment:created', payment);
    Logger.info(`Payment created: ${id}`);

    return payment;
  }

  async process(id: string): Promise<PaymentNew> {
    const payment = await this.get(id);
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'pending') throw new Error('Payment cannot be processed');

    payment.status = 'processing';
    payment.updatedAt = new Date();
    await this.save(payment);

    const attempt: PaymentAttempt = {
      id: this.generateId(),
      status: 'processing',
      createdAt: new Date(),
    };

    try {
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(payment.amount * 100),
        currency: payment.currency,
        description: payment.description,
        metadata: { paymentId: id, userId: payment.userId },
      });

      payment.providerPaymentId = pi.id;
      attempt.status = pi.status;

      if (pi.status === 'succeeded') {
        payment.status = 'succeeded';
        payment.completedAt = new Date();
        payment.stripeChargeId = pi.latest_charge as string;
      } else if (pi.status === 'requires_action') {
        payment.status = 'requires_action';
      } else {
        payment.status = 'failed';
      }
    } catch (err: any) {
      payment.status = 'failed';
      attempt.status = 'failed';
      attempt.error = err.message;
      Logger.error(`Payment processing failed: ${id}`, err);
    }

    payment.attempts.push(attempt);
    payment.updatedAt = new Date();
    await this.save(payment);

    this.emit(`payment:${payment.status}`, payment);

    return payment;
  }

  async refund(id: string, amount?: number): Promise<{ success: boolean; refundId?: string; error?: string }> {
    const payment = await this.get(id);
    if (!payment) return { success: false, error: 'Payment not found' };
    if (!['succeeded', 'partially_refunded'].includes(payment.status)) {
      return { success: false, error: 'Payment cannot be refunded' };
    }

    const refundAmount = amount || payment.amount - payment.refundAmount;
    if (refundAmount <= 0) return { success: false, error: 'Nothing to refund' };

    try {
      const refund = await stripe.refunds.create({
        payment_intent: payment.providerPaymentIntentId!,
        amount: Math.round(refundAmount * 100),
      });

      payment.refundAmount += refundAmount;
      payment.status = payment.refundAmount >= payment.amount ? 'refunded' : 'partially_refunded';
      payment.updatedAt = new Date();
      await this.save(payment);

      this.emit('payment:refunded', { payment, refundId: refund.id });

      return { success: true, refundId: refund.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async get(id: string): Promise<PaymentNew | null> {
    const cached = await this.redis.get(`payment_new:${id}`);
    if (cached) return JSON.parse(cached);

    const results = await this.db.query(
      'SELECT * FROM payments_new WHERE id = ?',
      [id]
    ) as any[];

    return results.length > 0 ? this.mapRow(results[0]) : null;
  }

  async getByUser(userId: string, page = 1, limit = 25): Promise<PaymentNew[]> {
    const offset = (page - 1) * limit;
    const results = await this.db.query(
      'SELECT * FROM payments_new WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    ) as any[];

    return results.map(this.mapRow);
  }

  private generateId(): string {
    return `pmt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getIdempotent(key: string): Promise<PaymentNew | null> {
    const data = await this.redis.get(`payment_new_idempotent:${key}`);
    return data ? JSON.parse(data) : null;
  }

  private async setIdempotent(key: string, payment: PaymentNew): Promise<void> {
    await this.redis.setex(`payment_new_idempotent:${key}`, 86400, JSON.stringify(payment));
  }

  private async save(payment: PaymentNew): Promise<void> {
    await this.redis.setex(`payment_new:${payment.id}`, 3600, JSON.stringify(payment));
  }

  private mapRow(row: any): PaymentNew {
    return {
      id: row.id,
      userId: row.user_id,
      organizationId: row.organization_id,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      status: row.status,
      provider: row.provider,
      providerPaymentId: row.provider_payment_id,
      providerCustomerId: row.provider_customer_id,
      refundAmount: row.refund_amount,
      taxAmount: row.tax_amount,
      feeAmount: row.fee_amount,
      netAmount: row.net_amount,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      attempts: typeof row.attempts === 'string' ? JSON.parse(row.attempts) : row.attempts,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  }
}
