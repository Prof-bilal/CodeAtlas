import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../database/databaseService.js';
import { logger } from '../utils/logger.js';

export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod?: string;
  stripePaymentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentInput {
  userId: string;
  amount: number;
  currency?: string;
  status?: string;
  paymentMethod?: string;
  stripePaymentId?: string;
}

export class PaymentRepository {
  async findById(id: string): Promise<Payment | null> {
    const result = await databaseService.query<Payment>(
      'SELECT * FROM payments WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async create(input: CreatePaymentInput): Promise<Payment> {
    const id = uuidv4();
    const result = await databaseService.query<Payment>(
      `INSERT INTO payments (id, user_id, amount, currency, status, payment_method, stripe_payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, input.userId, input.amount, input.currency || 'USD', input.status || 'pending', input.paymentMethod, input.stripePaymentId]
    );
    return result.rows[0];
  }

  async updateStatus(id: string, status: string): Promise<Payment | null> {
    const result = await databaseService.query<Payment>(
      `UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return result.rows[0] || null;
  }

  async findByUserId(userId: string, options?: { limit?: number; offset?: number }): Promise<Payment[]> {
    let query = 'SELECT * FROM payments WHERE user_id = $1';
    const params: any[] = [userId];

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await databaseService.query<Payment>(query, params);
    return result.rows;
  }

  async findByStripePaymentId(stripePaymentId: string): Promise<Payment | null> {
    const result = await databaseService.query<Payment>(
      'SELECT * FROM payments WHERE stripe_payment_id = $1',
      [stripePaymentId]
    );
    return result.rows[0] || null;
  }

  async sumByUserId(userId: string, status?: string): Promise<number> {
    let query = 'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE user_id = $1';
    const params: any[] = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    const result = await databaseService.query<{ total: string }>(query, params);
    return parseInt(result.rows[0].total);
  }

  async count(status?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM payments';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    const result = await databaseService.query<{ count: string }>(query, params);
    return parseInt(result.rows[0].count);
  }
}

export const paymentRepository = new PaymentRepository();
