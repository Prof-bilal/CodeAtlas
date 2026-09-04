import { logger } from '../utils/logger.js';
import { EventBus } from '../events/eventBus.js';
import { jobQueue } from './jobQueue.js';
import { emailService } from '../notifications/emailService.js';
import { notificationService } from '../notifications/notificationService.js';

export interface EmailJob {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailProcessor {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async process(job: EmailJob): Promise<void> {
    try {
      await emailService.sendEmail(job.to, job.subject, job.html);
      logger.info(`Email sent to ${job.to}`);
    } catch (error) {
      logger.error(`Failed to send email to ${job.to}:`, error);
      throw error;
    }
  }

  async queueEmail(to: string, subject: string, html: string): Promise<string> {
    const job = await jobQueue.addJob('email', { to, subject, html });
    return job.id;
  }
}

export const emailProcessor = new EmailProcessor(new EventBus());
