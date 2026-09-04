// Payment service class - OLD
// Replaced by PaymentServiceV2 in 2024-01
// DO NOT USE for new integrations

import { stripe } from './integrations/stripe';
import type { Database } from './database/connection';
import { Logger } from './utils';
import { v4 as uuidv4 } from 'uuid';

interface PaymentRecord {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  stripeId: string | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export class PaymentService {
  private db: Database;
  private static instance: PaymentService;

  private constructor(db: Database) {
    this.db = db;
  }

  static getInstance(db: Database): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService(db);
    }
    return PaymentService.instance;
  }

  async createPayment(
    userId: string,
    amount: number,
    currency: string,
    description: string
  ): Promise<PaymentRecord> {
    const id = uuidv4();

    const record: PaymentRecord = {
      id,
      userId,
      amount,
      currency,
      description,
      status: 'pending',
      stripeId: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.db.query(
      `INSERT INTO payments (id, user_id, amount, currency, description, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, amount, currency, description, 'pending', '{}',
       record.createdAt.toISOString(), record.updatedAt.toISOString()]
    );

    Logger.info(`Payment created: ${id}`);

    return record;
  }

  async processPayment(paymentId: string): Promise<PaymentRecord> {
    const records = await this.db.query(
      'SELECT * FROM payments WHERE id = ?',
      [paymentId]
    ) as PaymentRecord[];

    if (records.length === 0) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    const record = records[0];

    try {
      const charge = await stripe.charges.create({
        amount: Math.round(record.amount * 100),
        currency: record.currency,
        description: record.description,
      });

      record.stripeId = charge.id;
      record.status = 'completed';
    } catch (err) {
      record.status = 'failed';
      Logger.error(`Payment ${paymentId} failed:`, err);
    }

    record.updatedAt = new Date();

    await this.db.query(
      'UPDATE payments SET status = ?, stripe_id = ?, updated_at = ? WHERE id = ?',
      [record.status, record.stripeId, record.updatedAt.toISOString(), paymentId]
    );

    return record;
  }

  async getPayment(id: string): Promise<PaymentRecord | null> {
    const results = await this.db.query(
      'SELECT * FROM payments WHERE id = ?',
      [id]
    ) as PaymentRecord[];

    return results.length > 0 ? results[0] : null;
  }

  async getUserPayments(userId: string): Promise<PaymentRecord[]> {
    return await this.db.query(
      'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    ) as PaymentRecord[];
  }

  async cancelPayment(id: string): Promise<boolean> {
    const record = await this.getPayment(id);
    if (!record || record.status !== 'pending') return false;

    await this.db.query(
      "UPDATE payments SET status = 'cancelled', updated_at = ? WHERE id = ?",
      [new Date().toISOString(), id]
    );

    return true;
  }
}
