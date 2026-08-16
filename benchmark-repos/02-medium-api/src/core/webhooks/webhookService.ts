import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { EventBus } from '../../events/eventBus.js';
import { cacheService } from '../../services/cacheService.js';
import crypto from 'crypto';

export interface Webhook {
  id: string;
  userId: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, any>;
  response?: { status: number; body: string };
  deliveredAt: Date;
}

export interface WebhookTestResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export class WebhookService {
  private webhooks: Webhook[] = [];
  private logs: WebhookLog[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async createWebhook(data: Omit<Webhook, 'id' | 'createdAt' | 'updatedAt' | 'secret'> & { secret?: string }): Promise<Webhook> {
    const webhook: Webhook = {
      ...data,
      id: uuidv4(),
      secret: data.secret || crypto.randomBytes(32).toString('hex'),
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.webhooks.push(webhook);
    await cacheService.invalidate(`webhooks:${data.userId}`);
    this.eventBus.emit('webhook:created', { webhook });

    return webhook;
  }

  async getWebhook(id: string): Promise<Webhook> {
    const webhook = this.webhooks.find(w => w.id === id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }
    return webhook;
  }

  async getUserWebhooks(userId: string): Promise<Webhook[]> {
    return this.webhooks.filter(w => w.userId === userId);
  }

  async updateWebhook(id: string, data: Partial<Webhook>): Promise<Webhook> {
    const webhook = await this.getWebhook(id);
    Object.assign(webhook, data, { updatedAt: new Date() });

    await cacheService.invalidate(`webhooks:${webhook.userId}`);
    this.eventBus.emit('webhook:updated', { webhook });

    return webhook;
  }

  async deleteWebhook(id: string): Promise<void> {
    const index = this.webhooks.findIndex(w => w.id === id);
    if (index === -1) {
      throw new Error('Webhook not found');
    }

    const [deletedWebhook] = this.webhooks.splice(index, 1);
    await cacheService.invalidate(`webhooks:${deletedWebhook.userId}`);
    this.eventBus.emit('webhook:deleted', { webhookId: id });
  }

  async testWebhook(id: string): Promise<WebhookTestResult> {
    const webhook = await this.getWebhook(id);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhook.secret,
        },
        body: JSON.stringify({
          event: 'webhook:test',
          data: { webhookId: id, timestamp: new Date().toISOString() },
        }),
      });

      const log: WebhookLog = {
        id: uuidv4(),
        webhookId: id,
        event: 'webhook:test',
        payload: {},
        response: { status: response.status, body: await response.text() },
        deliveredAt: new Date(),
      };
      this.logs.push(log);

      this.eventBus.emit('webhook:test:success', { webhookId: id });
      return { success: response.ok, statusCode: response.status };
    } catch (error) {
      this.eventBus.emit('webhook:test:failed', { webhookId: id, error });
      return { success: false, error: (error as Error).message };
    }
  }

  async getWebhookLogs(webhookId: string): Promise<WebhookLog[]> {
    return this.logs.filter(l => l.webhookId === webhookId);
  }
}

export const webhookService = new WebhookService(new EventBus());
