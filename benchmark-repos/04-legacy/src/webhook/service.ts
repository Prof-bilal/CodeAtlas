// Webhook service - CURRENT

import { Database } from '../database/connection';
import { Logger } from '../utils';
import { createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: Date;
  lastTriggeredAt: Date | null;
  failureCount: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: any;
  status: 'pending' | 'success' | 'failed';
  response?: { status: number; body: string };
  error?: string;
  deliveredAt: Date | null;
  createdAt: Date;
}

export class WebhookService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async createWebhook(url: string, events: string[]): Promise<Webhook> {
    const id = uuidv4();
    const secret = uuidv4();

    await this.db.query(
      INSERT INTO webhooks (id, url, events, secret, active, created_at)
       VALUES (?, ?, ?, ?, true, ?),
      [id, url, JSON.stringify(events), secret, new Date().toISOString()]
    );

    return {
      id,
      url,
      events,
      secret,
      active: true,
      createdAt: new Date(),
      lastTriggeredAt: null,
      failureCount: 0,
    };
  }

  async getWebhook(id: string): Promise<Webhook | null> {
    const results = await this.db.query(
      'SELECT * FROM webhooks WHERE id = ?',
      [id]
    ) as any[];

    return results.length > 0 ? this.mapWebhookRow(results[0]) : null;
  }

  async listWebhooks(): Promise<Webhook[]> {
    const results = await this.db.query(
      'SELECT * FROM webhooks WHERE active = true'
    ) as any[];

    return results.map(this.mapWebhookRow);
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.db.query('DELETE FROM webhooks WHERE id = ?', [id]);
  }

  async triggerEvent(event: string, payload: any): Promise<WebhookDelivery[]> {
    const webhooks = await this.db.query(
      "SELECT * FROM webhooks WHERE active = true AND events LIKE ?",
      [%%]
    ) as any[];

    const deliveries: WebhookDelivery[] = [];

    for (const webhook of webhooks) {
      const delivery = await this.deliver(webhook, event, payload);
      deliveries.push(delivery);
    }

    return deliveries;
  }

  private async deliver(
    webhook: any,
    event: string,
    payload: any
  ): Promise<WebhookDelivery> {
    const deliveryId = uuidv4();
    const body = JSON.stringify({ event, payload, timestamp: new Date() });
    const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');

    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhookId: webhook.id,
      event,
      payload,
      status: 'pending',
      createdAt: new Date(),
    };

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body,
      });

      delivery.status = response.ok ? 'success' : 'failed';
      delivery.response = {
        status: response.status,
        body: await response.text(),
      };
      delivery.deliveredAt = new Date();

      await this.db.query(
        INSERT INTO webhook_deliveries (id, webhook_id, event, payload, status, response, delivered_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?),
        [deliveryId, webhook.id, event, JSON.stringify(payload), delivery.status,
         JSON.stringify(delivery.response), delivery.deliveredAt.toISOString(), delivery.createdAt.toISOString()]
      );

      // Update webhook last triggered
      await this.db.query(
        'UPDATE webhooks SET last_triggered_at = ? WHERE id = ?',
        [new Date().toISOString(), webhook.id]
      );

    } catch (err: any) {
      delivery.status = 'failed';
      delivery.error = err.message;

      await this.db.query(
        INSERT INTO webhook_deliveries (id, webhook_id, event, payload, status, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?),
        [deliveryId, webhook.id, event, JSON.stringify(payload), 'failed', err.message, delivery.createdAt.toISOString()]
      );

      // Increment failure count
      await this.db.query(
        'UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?',
        [webhook.id]
      );

      Logger.error(Webhook delivery failed: , err);
    }

    return delivery;
  }

  async verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    return signature === expected;
  }

  async getDeliveries(webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
    const results = await this.db.query(
      'SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?',
      [webhookId, limit]
    ) as any[];

    return results.map(this.mapDeliveryRow);
  }

  private mapWebhookRow(row: any): Webhook {
    return {
      id: row.id,
      url: row.url,
      events: typeof row.events === 'string' ? JSON.parse(row.events) : row.events,
      secret: row.secret,
      active: row.active,
      createdAt: new Date(row.created_at),
      lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : null,
      failureCount: row.failure_count,
    };
  }

  private mapDeliveryRow(row: any): WebhookDelivery {
    return {
      id: row.id,
      webhookId: row.webhook_id,
      event: row.event,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      status: row.status,
      response: row.response ? (typeof row.response === 'string' ? JSON.parse(row.response) : row.response) : undefined,
      error: row.error,
      deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
