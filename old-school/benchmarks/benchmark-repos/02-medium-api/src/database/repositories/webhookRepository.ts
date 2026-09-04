import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../database/databaseService.js';
import { logger } from '../utils/logger.js';

export interface Webhook {
  id: string;
  userId: string;
  url: string;
  secret?: string;
  events: string[];
  active: boolean;
  lastTriggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWebhookInput {
  userId: string;
  url: string;
  secret?: string;
  events?: string[];
  active?: boolean;
}

export class WebhookRepository {
  async findById(id: string): Promise<Webhook | null> {
    const result = await databaseService.query<Webhook>(
      'SELECT * FROM webhooks WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async create(input: CreateWebhookInput): Promise<Webhook> {
    const id = uuidv4();
    const result = await databaseService.query<Webhook>(
      `INSERT INTO webhooks (id, user_id, url, secret, events, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, input.userId, input.url, input.secret, input.events || [], input.active !== false]
    );
    return result.rows[0];
  }

  async update(id: string, input: Partial<CreateWebhookInput>): Promise<Webhook | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.url !== undefined) {
      fields.push(`url = $${paramCount++}`);
      values.push(input.url);
    }
    if (input.secret !== undefined) {
      fields.push(`secret = $${paramCount++}`);
      values.push(input.secret);
    }
    if (input.events !== undefined) {
      fields.push(`events = $${paramCount++}`);
      values.push(input.events);
    }
    if (input.active !== undefined) {
      fields.push(`active = $${paramCount++}`);
      values.push(input.active);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await databaseService.query<Webhook>(
      `UPDATE webhooks SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await databaseService.query(
      'DELETE FROM webhooks WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findByUserId(userId: string): Promise<Webhook[]> {
    const result = await databaseService.query<Webhook>(
      'SELECT * FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async findByEvent(event: string): Promise<Webhook[]> {
    const result = await databaseService.query<Webhook>(
      `SELECT * FROM webhooks WHERE active = true AND $1 = ANY(events)`,
      [event]
    );
    return result.rows;
  }

  async updateLastTriggered(id: string): Promise<void> {
    await databaseService.query(
      'UPDATE webhooks SET last_triggered_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }
}

export const webhookRepository = new WebhookRepository();
