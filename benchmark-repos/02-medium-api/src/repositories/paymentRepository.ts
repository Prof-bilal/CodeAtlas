import { query, queryOne } from '../config/database.js';
import { PaymentModel, CreatePaymentInput } from '../models/payment.js';

export class PaymentRepository {
  async findById(id: string): Promise<PaymentModel | null> {
    const row = await queryOne<any>(
      'SELECT * FROM payments WHERE id = $1',
      [id]
    );
    
    if (!row) return null;
    
    return this.mapRowToPayment(row);
  }

  async findByStripePaymentIntentId(stripePaymentIntentId: string): Promise<PaymentModel | null> {
    const row = await queryOne<any>(
      'SELECT * FROM payments WHERE stripe_payment_intent_id = $1',
      [stripePaymentIntentId]
    );
    
    if (!row) return null;
    
    return this.mapRowToPayment(row);
  }

  async create(input: CreatePaymentInput & { stripePaymentIntentId: string; status: string }): Promise<PaymentModel> {
    const row = await queryOne<any>(
      `INSERT INTO payments (user_id, stripe_payment_intent_id, amount, currency, status, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.userId,
        input.stripePaymentIntentId,
        input.amount,
        input.currency || 'usd',
        input.status,
        input.description || null,
        JSON.stringify(input.metadata || {}),
      ]
    );
    
    return this.mapRowToPayment(row!);
  }

  async update(id: string, input: Partial<PaymentModel>): Promise<PaymentModel | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }

    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(input.metadata));
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const row = await queryOne<any>(
      `UPDATE payments SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return row ? this.mapRowToPayment(row) : null;
  }

  async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<PaymentModel[]> {
    const rows = await query<any>(
      'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    
    return rows.map(this.mapRowToPayment);
  }

  async countByUserId(userId: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM payments WHERE user_id = $1',
      [userId]
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async findRecent(limit: number = 10): Promise<PaymentModel[]> {
    const rows = await query<any>(
      'SELECT * FROM payments ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    
    return rows.map(this.mapRowToPayment);
  }

  async getTotalByUserId(userId: string): Promise<number> {
    const result = await queryOne<{ total: string }>(
      "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE user_id = $1 AND status = 'succeeded'",
      [userId]
    );
    
    return parseInt(result?.total || '0', 10);
  }

  private mapRowToPayment(row: any): PaymentModel {
    return {
      id: row.id,
      userId: row.user_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      stripeInvoiceId: row.stripe_invoice_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      description: row.description,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const paymentRepository = new PaymentRepository();
