import { query, queryOne } from '../config/database.js';
import { Subscription } from '../models/index.js';

export class SubscriptionRepository {
  async findById(id: string): Promise<Subscription | null> {
    const row = await queryOne<any>(
      'SELECT * FROM subscriptions WHERE id = $1',
      [id]
    );
    
    if (!row) return null;
    
    return this.mapRowToSubscription(row);
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null> {
    const row = await queryOne<any>(
      'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1',
      [stripeSubscriptionId]
    );
    
    if (!row) return null;
    
    return this.mapRowToSubscription(row);
  }

  async create(input: {
    userId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    status: 'active' | 'canceled' | 'past_due' | 'unpaid';
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  }): Promise<Subscription> {
    const row = await queryOne<any>(
      `INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_price_id, status, current_period_start, current_period_end, cancel_at_period_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.userId,
        input.stripeSubscriptionId,
        input.stripePriceId,
        input.status,
        input.currentPeriodStart,
        input.currentPeriodEnd,
        input.cancelAtPeriodEnd,
      ]
    );
    
    return this.mapRowToSubscription(row!);
  }

  async update(id: string, input: Partial<Subscription>): Promise<Subscription | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (input.currentPeriodStart !== undefined) {
      updates.push(`current_period_start = $${paramIndex++}`);
      values.push(input.currentPeriodStart);
    }

    if (input.currentPeriodEnd !== undefined) {
      updates.push(`current_period_end = $${paramIndex++}`);
      values.push(input.currentPeriodEnd);
    }

    if (input.cancelAtPeriodEnd !== undefined) {
      updates.push(`cancel_at_period_end = $${paramIndex++}`);
      values.push(input.cancelAtPeriodEnd);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const row = await queryOne<any>(
      `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return row ? this.mapRowToSubscription(row) : null;
  }

  async findByUserId(userId: string): Promise<Subscription[]> {
    const rows = await query<any>(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    return rows.map(this.mapRowToSubscription);
  }

  async findActiveByUserId(userId: string): Promise<Subscription | null> {
    const row = await queryOne<any>(
      "SELECT * FROM subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC",
      [userId]
    );
    
    return row ? this.mapRowToSubscription(row) : null;
  }

  async count(): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM subscriptions'
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async countByStatus(status: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM subscriptions WHERE status = $1',
      [status]
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async findExpiringSoon(days: number = 7): Promise<Subscription[]> {
    const rows = await query<any>(
      `SELECT * FROM subscriptions 
       WHERE current_period_end <= CURRENT_TIMESTAMP + INTERVAL '${days} days'
       AND status = 'active'
       AND cancel_at_period_end = false
       ORDER BY current_period_end ASC`
    );
    
    return rows.map(this.mapRowToSubscription);
  }

  private mapRowToSubscription(row: any): Subscription {
    return {
      id: row.id,
      userId: row.user_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      stripePriceId: row.stripe_price_id,
      status: row.status,
      currentPeriodStart: new Date(row.current_period_start),
      currentPeriodEnd: new Date(row.current_period_end),
      cancelAtPeriodEnd: row.cancel_at_period_end,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const subscriptionRepository = new SubscriptionRepository();
