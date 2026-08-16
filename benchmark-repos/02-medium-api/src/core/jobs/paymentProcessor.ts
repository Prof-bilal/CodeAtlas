import { JobQueue } from './jobQueue.js';
import { logger } from '../../utils/logger.js';

export class PaymentProcessor {
  private queue: JobQueue;

  constructor() {
    this.queue = new JobQueue('payment', { concurrency: 2 });
    this.setupProcessors();
  }

  private setupProcessors(): void {
    this.queue.process('process-payment', {
      process: async (job) => {
        const { paymentId, amount, currency, method } = job.data;
        logger.info(`Processing payment ${paymentId} for ${amount} ${currency}`);
        
        // Simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return { 
          success: true,
          transactionId: `txn_${Date.now()}`,
          paymentId,
          amount,
          currency,
        };
      },
    });

    this.queue.process('refund-payment', {
      process: async (job) => {
        const { paymentId, amount, reason } = job.data;
        logger.info(`Refunding payment ${paymentId} for ${amount}`);
        
        // Simulate refund processing
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return { 
          refunded: true,
          refundId: `ref_${Date.now()}`,
          paymentId,
          amount,
          reason,
        };
      },
    });

    this.queue.process('recurring-payment', {
      process: async (job) => {
        const { subscriptionId, amount, currency } = job.data;
        logger.info(`Processing recurring payment for subscription ${subscriptionId}`);
        
        // Simulate recurring payment
        await new Promise(resolve => setTimeout(resolve, 800));
        
        return { 
          processed: true,
          subscriptionId,
          amount,
          currency,
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        };
      },
    });

    this.queue.process('payment-notification', {
      process: async (job) => {
        const { paymentId, userId, status } = job.data;
        logger.info(`Sending payment notification for payment ${paymentId}`);
        
        // Simulate notification sending
        await new Promise(resolve => setTimeout(resolve, 200));
        
        return { 
          notified: true,
          paymentId,
          userId,
          status,
        };
      },
    });
  }

  async processPayment(paymentId: string, amount: number, currency: string, method: string): Promise<string> {
    const job = await this.queue.add('process-payment', { paymentId, amount, currency, method });
    return job.id;
  }

  async refundPayment(paymentId: string, amount: number, reason?: string): Promise<string> {
    const job = await this.queue.add('refund-payment', { paymentId, amount, reason });
    return job.id;
  }

  async processRecurringPayment(subscriptionId: string, amount: number, currency: string): Promise<string> {
    const job = await this.queue.add('recurring-payment', { subscriptionId, amount, currency });
    return job.id;
  }

  async sendPaymentNotification(paymentId: string, userId: string, status: string): Promise<string> {
    const job = await this.queue.add('payment-notification', { paymentId, userId, status });
    return job.id;
  }

  getStats() {
    return this.queue.getStats();
  }
}

export const paymentProcessor = new PaymentProcessor();
