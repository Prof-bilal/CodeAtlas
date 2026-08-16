import { JobQueue } from './jobQueue.js';
import { logger } from '../../utils/logger.js';

export class SubscriptionProcessor {
  private queue: JobQueue;

  constructor() {
    this.queue = new JobQueue('subscription', { concurrency: 2 });
    this.setupProcessors();
  }

  private setupProcessors(): void {
    this.queue.process('renew-subscription', {
      process: async (job) => {
        const { subscriptionId, planId, amount } = job.data;
        logger.info(`Renewing subscription ${subscriptionId}`);
        
        // Simulate subscription renewal
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return { 
          renewed: true,
          subscriptionId,
          newEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          amount,
        };
      },
    });

    this.queue.process('cancel-subscription', {
      process: async (job) => {
        const { subscriptionId, reason, immediate } = job.data;
        logger.info(`Canceling subscription ${subscriptionId}`);
        
        // Simulate subscription cancellation
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return { 
          canceled: true,
          subscriptionId,
          effectiveDate: immediate ? new Date() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          reason,
        };
      },
    });

    this.queue.process('upgrade-subscription', {
      process: async (job) => {
        const { subscriptionId, newPlanId, proration } = job.data;
        logger.info(`Upgrading subscription ${subscriptionId} to plan ${newPlanId}`);
        
        // Simulate subscription upgrade
        await new Promise(resolve => setTimeout(resolve, 800));
        
        return { 
          upgraded: true,
          subscriptionId,
          newPlanId,
          proration,
          effectiveDate: new Date(),
        };
      },
    });

    this.queue.process('send-renewal-reminder', {
      process: async (job) => {
        const { subscriptionId, userId, daysUntilRenewal } = job.data;
        logger.info(`Sending renewal reminder for subscription ${subscriptionId}`);
        
        // Simulate reminder sending
        await new Promise(resolve => setTimeout(resolve, 200));
        
        return { 
          sent: true,
          subscriptionId,
          userId,
          daysUntilRenewal,
        };
      },
    });
  }

  async renewSubscription(subscriptionId: string, planId: string, amount: number): Promise<string> {
    const job = await this.queue.add('renew-subscription', { subscriptionId, planId, amount });
    return job.id;
  }

  async cancelSubscription(subscriptionId: string, reason?: string, immediate: boolean = false): Promise<string> {
    const job = await this.queue.add('cancel-subscription', { subscriptionId, reason, immediate });
    return job.id;
  }

  async upgradeSubscription(subscriptionId: string, newPlanId: string, proration?: string): Promise<string> {
    const job = await this.queue.add('upgrade-subscription', { subscriptionId, newPlanId, proration });
    return job.id;
  }

  async sendRenewalReminder(subscriptionId: string, userId: string, daysUntilRenewal: number): Promise<string> {
    const job = await this.queue.add('send-renewal-reminder', { subscriptionId, userId, daysUntilRenewal });
    return job.id;
  }

  getStats() {
    return this.queue.getStats();
  }
}

export const subscriptionProcessor = new SubscriptionProcessor();
