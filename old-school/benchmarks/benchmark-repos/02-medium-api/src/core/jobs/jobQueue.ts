import { logger } from '../utils/logger.js';
import { EventBus } from '../events/eventBus.js';
import { Redis } from 'ioredis';

export interface QueueJob {
  id: string;
  type: string;
  data: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export class JobQueue {
  private jobs: Map<string, QueueJob> = new Map();
  private eventBus: EventBus;
  private processing = false;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async addJob(type: string, data: Record<string, any>, options?: { maxAttempts?: number }): Promise<QueueJob> {
    const job: QueueJob = {
      id: crypto.randomUUID(),
      type,
      data,
      status: 'pending',
      attempts: 0,
      maxAttempts: options?.maxAttempts || 3,
      createdAt: new Date(),
    };

    this.jobs.set(job.id, job);
    this.eventBus.emit('job:added', { jobId: job.id, type });

    return job;
  }

  async processNext(): Promise<QueueJob | null> {
    const pendingJob = Array.from(this.jobs.values()).find(j => j.status === 'pending');
    if (!pendingJob) {
      return null;
    }

    pendingJob.status = 'processing';
    pendingJob.attempts++;
    pendingJob.processedAt = new Date();

    try {
      await this.processJob(pendingJob);
      pendingJob.status = 'completed';
      pendingJob.completedAt = new Date();
      this.eventBus.emit('job:completed', { jobId: pendingJob.id, type: pendingJob.type });
    } catch (error) {
      pendingJob.status = pendingJob.attempts >= pendingJob.maxAttempts ? 'failed' : 'pending';
      pendingJob.error = (error as Error).message;
      this.eventBus.emit('job:failed', { jobId: pendingJob.id, type: pendingJob.type, error });
    }

    return pendingJob;
  }

  private async processJob(job: QueueJob): Promise<void> {
    logger.info(`Processing job: ${job.type} (${job.id})`);

    switch (job.type) {
      case 'email':
        await this.processEmailJob(job);
        break;
      case 'notification':
        await this.processNotificationJob(job);
        break;
      case 'webhook':
        await this.processWebhookJob(job);
        break;
      default:
        logger.warn(`Unknown job type: ${job.type}`);
    }
  }

  private async processEmailJob(job: QueueJob): Promise<void> {
    logger.info(`Sending email to ${job.data.recipient}`);
  }

  private async processNotificationJob(job: QueueJob): Promise<void> {
    logger.info(`Sending notification to user ${job.data.userId}`);
  }

  private async processWebhookJob(job: QueueJob): Promise<void> {
    logger.info(`Triggering webhook ${job.data.webhookId}`);
  }

  async getJob(id: string): Promise<QueueJob | undefined> {
    return this.jobs.get(id);
  }

  async getJobsByType(type: string): Promise<QueueJob[]> {
    return Array.from(this.jobs.values()).filter(j => j.type === type);
  }

  async getStats(): Promise<{ total: number; pending: number; processing: number; completed: number; failed: number }> {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
    };
  }

  async clearCompleted(): Promise<number> {
    const completedJobs = Array.from(this.jobs.values()).filter(j => j.status === 'completed');
    completedJobs.forEach(j => this.jobs.delete(j.id));
    return completedJobs.length;
  }

  async retryJob(id: string): Promise<QueueJob | undefined> {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'failed') {
      return undefined;
    }

    job.status = 'pending';
    job.attempts = 0;
    job.error = undefined;
    return job;
  }
}

export const jobQueue = new JobQueue(new EventBus());
