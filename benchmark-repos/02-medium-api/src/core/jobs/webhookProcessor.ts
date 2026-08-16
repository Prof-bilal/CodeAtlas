import { logger } from '../utils/logger.js';
import { EventBus } from '../events/eventBus.js';
import { jobQueue } from './jobQueue.js';

export interface WebhookJob {
  webhookId: string;
  event: string;
  payload: Record<string, any>;
}

export class WebhookProcessor {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async process(job: WebhookJob): Promise<void> {
    try {
      logger.info(`Triggering webhook ${job.webhookId} for event ${job.event}`);
      // Webhook trigger logic here
      logger.info(`Webhook ${job.webhookId} triggered successfully`);
    } catch (error) {
      logger.error(`Failed to trigger webhook ${job.webhookId}:`, error);
      throw error;
    }
  }

  async queueWebhook(webhookId: string, event: string, payload: Record<string, any>): Promise<string> {
    const job = await jobQueue.addJob('webhook', { webhookId, event, payload });
    return job.id;
  }
}

export const webhookProcessor = new WebhookProcessor(new EventBus());
