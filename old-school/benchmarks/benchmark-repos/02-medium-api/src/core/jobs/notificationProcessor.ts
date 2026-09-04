import { logger } from '../utils/logger.js';
import { EventBus } from '../events/eventBus.js';
import { jobQueue } from './jobQueue.js';
import { notificationService } from '../notifications/notificationService.js';

export interface NotificationJob {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
}

export class NotificationProcessor {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async process(job: NotificationJob): Promise<void> {
    try {
      await notificationService.createNotification({
        userId: job.userId,
        type: job.type,
        title: job.title,
        message: job.message,
        data: job.data || {},
      });
      logger.info(`Notification created for user ${job.userId}`);
    } catch (error) {
      logger.error(`Failed to create notification for user ${job.userId}:`, error);
      throw error;
    }
  }

  async queueNotification(userId: string, type: string, title: string, message: string): Promise<string> {
    const job = await jobQueue.addJob('notification', { userId, type, title, message });
    return job.id;
  }
}

export const notificationProcessor = new NotificationProcessor(new EventBus());
