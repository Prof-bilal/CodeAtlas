import { WebhookRepository } from '../database/repositories/webhookRepository.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';

export interface WebhookService {
  getWebhook(id: string): Promise<any>;
  getUserWebhooks(userId: string): Promise<any[]>;
  createWebhook(data: any): Promise<any>;
  updateWebhook(id: string, data: any): Promise<any>;
  deleteWebhook(id: string): Promise<boolean>;
  triggerWebhooks(event: string, payload: any): Promise<void>;
}

export class WebhookServiceImpl implements WebhookService {
  private webhookRepository: WebhookRepository;

  constructor() {
    this.webhookRepository = new WebhookRepository();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const events = [
      'user.registered',
      'user.updated',
      'task.created',
      'task.completed',
      'payment.success',
      'subscription.created',
    ];

    for (const eventType of events) {
      eventBus.on(eventType as any, async (event) => {
        await this.triggerWebhooks(eventType, event);
      });
    }
  }

  async getWebhook(id: string): Promise<any> {
    const webhook = await this.webhookRepository.findById(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }
    return webhook;
  }

  async getUserWebhooks(userId: string): Promise<any[]> {
    return this.webhookRepository.findByUserId(userId);
  }

  async createWebhook(data: any): Promise<any> {
    const webhook = await this.webhookRepository.create(data);
    return webhook;
  }

  async updateWebhook(id: string, data: any): Promise<any> {
    const webhook = await this.webhookRepository.findById(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    return this.webhookRepository.update(id, data);
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const webhook = await this.webhookRepository.findById(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    return this.webhookRepository.delete(id);
  }

  async triggerWebhooks(event: string, payload: any): Promise<void> {
    const webhooks = await this.webhookRepository.findByEvent(event);

    for (const webhook of webhooks) {
      try {
        await this.sendWebhook(webhook, event, payload);
        await this.webhookRepository.updateLastTriggered(webhook.id);
      } catch (error) {
        logger.error(`Failed to trigger webhook ${webhook.id}:`, error);
      }
    }
  }

  private async sendWebhook(webhook: any, event: string, payload: any): Promise<void> {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event,
        'X-Webhook-Secret': webhook.secret || '',
      },
      body: JSON.stringify({
        event,
        payload,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned status ${response.status}`);
    }
  }
}

export const webhookService = new WebhookServiceImpl();
