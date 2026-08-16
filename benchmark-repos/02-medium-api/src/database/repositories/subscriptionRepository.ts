import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../database/databaseService.js';
import { logger } from '../utils/logger.js';

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubscriptionInput {
  userId: string;
  planId: string;
  status?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt?: Date;
}

export class SubscriptionRepository {
  async findById(id: string): Promise<Subscription | null> {
    const result = await databaseService.query<Subscription>(
      'SELECT * FROM subscriptions WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    const result = await databaseService.query<Subscription>(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );
    return result.rows[0] || null;
  }

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    const id = uuidv4();
    const result = await databaseService.query<Subscription>(
      `INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, input.userId, input.planId, input.status || 'active', input.currentPeriodStart, input.currentPeriodEnd, input.cancelAt]
    );
    return result.rows[0];
  }

  async update(id: string, input: Partial<CreateSubscriptionInput>): Promise<Subscription | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.planId !== undefined) {
      fields.push(`plan_id = $${paramCount++}`);
      values.push(input.planId);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(input.status);
    }
    if (input.currentPeriodStart !== undefined) {
      fields.push(`current_period_start = $${paramCount++}`);
      values.push(input.currentPeriodStart);
    }
    if (input.currentPeriodEnd !== undefined) {
      fields.push(`current_period_end = $${paramCount++}`);
      values.push(input.currentPeriodEnd);
    }
    if (input.cancelAt !== undefined) {
      fields.push(`cancel_at = $${paramCount++}`);
      values.push(input.cancelAt);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await databaseService.query<Subscription>(
      `UPDATE subscriptions SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async cancel(id: string): Promise<Subscription | null> {
    return this.update(id, { 
      status: 'canceled',
      cancelAt: new Date()
    });
  }

  async findExpiringSoon(days: number = 7): Promise<Subscription[]> {
    const result = await databaseService.query<Subscription>(
      `SELECT * FROM subscriptions 
       WHERE current_period_end <= CURRENT_TIMESTAMP + INTERVAL '${days} days'
       AND status = 'active'
       ORDER BY current_period_end ASC`
    );
    return result.rows;
  }

  async count(status?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM subscriptions';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    const result = await databaseService.query<{ count: string }>(query, params);
    return parseInt(result.rows[0].count);
  }
}

export const subscriptionRepository = new SubscriptionRepository();
