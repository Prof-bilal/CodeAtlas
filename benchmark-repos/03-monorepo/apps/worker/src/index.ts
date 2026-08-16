import { EmailProcessor, createEmailProcessor } from './processors/emailProcessor.js';
import { PaymentProcessor, createPaymentProcessor } from './processors/paymentProcessor.js';
import { ReportProcessor, createReportProcessor } from './processors/reportProcessor.js';
import { CleanupProcessor, createCleanupProcessor } from './processors/cleanupProcessor.js';
import { NotificationProcessor, createNotificationProcessor } from './processors/notificationProcessor.js';

export interface WorkerConfig {
  redisUrl?: string;
  concurrency: number;
  maxRetries: number;
  cleanupIntervalMs: number;
}

class WorkerService {
  private config: WorkerConfig;
  private emailProcessor: EmailProcessor;
  private paymentProcessor: PaymentProcessor;
  private reportProcessor: ReportProcessor;
  private cleanupProcessor: CleanupProcessor;
  private notificationProcessor: NotificationProcessor;
  private isRunning = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.emailProcessor = createEmailProcessor();
    this.paymentProcessor = createPaymentProcessor();
    this.reportProcessor = createReportProcessor();
    this.cleanupProcessor = createCleanupProcessor();
    this.notificationProcessor = createNotificationProcessor();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.cleanupTimer = setInterval(() => this.runCleanup(), this.config.cleanupIntervalMs);
    console.log(`Worker service started with concurrency ${this.config.concurrency}`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    console.log('Worker service stopped');
  }

  private async runCleanup(): Promise<void> {
    if (!this.isRunning) return;
    try {
      await this.cleanupProcessor.runAllCleanups();
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  getEmailProcessor(): EmailProcessor { return this.emailProcessor; }
  getPaymentProcessor(): PaymentProcessor { return this.paymentProcessor; }
  getReportProcessor(): ReportProcessor { return this.reportProcessor; }
  getCleanupProcessor(): CleanupProcessor { return this.cleanupProcessor; }
  getNotificationProcessor(): NotificationProcessor { return this.notificationProcessor; }

  getStats() {
    return {
      isRunning: this.isRunning,
      email: this.emailProcessor.getStats(),
      payment: this.paymentProcessor.getStats(),
      report: this.reportProcessor.getStats(),
      cleanup: this.cleanupProcessor.getStats(),
      notification: this.notificationProcessor.getStats(),
    };
  }
}

export function createWorkerService(config: WorkerConfig): WorkerService {
  return new WorkerService(config);
}

export { EmailProcessor } from './processors/emailProcessor.js';
export { PaymentProcessor } from './processors/paymentProcessor.js';
export { ReportProcessor } from './processors/reportProcessor.js';
export { CleanupProcessor } from './processors/cleanupProcessor.js';
export { NotificationProcessor } from './processors/notificationProcessor.js';
