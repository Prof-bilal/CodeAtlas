import { describe, it, expect } from 'vitest';
import { EmailProcessor } from '../src/core/jobs/emailProcessor.js';
import { NotificationProcessor } from '../src/core/jobs/notificationProcessor.js';
import { ReportProcessor } from '../src/core/jobs/reportProcessor.js';
import { DataProcessor } from '../src/core/jobs/dataProcessor.js';
import { WebhookProcessor } from '../src/core/jobs/webhookProcessor.js';
import { FileProcessor } from '../src/core/jobs/fileProcessor.js';
import { AnalyticsProcessor } from '../src/core/jobs/analyticsProcessor.js';
import { SearchProcessor } from '../src/core/jobs/searchProcessor.js';
import { PaymentProcessor } from '../src/core/jobs/paymentProcessor.js';
import { SubscriptionProcessor } from '../src/core/jobs/subscriptionProcessor.js';
import { AuditProcessor } from '../src/core/jobs/auditProcessor.js';
import { JobQueue } from '../src/core/jobs/jobQueue.js';

describe('Job System', () => {
  describe('JobQueue', () => {
    it('should export JobQueue class', () => { expect(JobQueue).toBeDefined(); });

    it('should create queue instance', () => {
      const queue = new JobQueue('test');
      expect(queue).toBeDefined();
    });

    it('should have required methods', () => {
      const queue = new JobQueue('test');
      expect(queue.add).toBeDefined();
      expect(queue.process).toBeDefined();
      expect(queue.getJob).toBeDefined();
      expect(queue.getJobs).toBeDefined();
      expect(queue.removeJob).toBeDefined();
      expect(queue.getStats).toBeDefined();
      expect(queue.stop).toBeDefined();
    });
  });

  describe('Processors', () => {
    it('should export EmailProcessor', () => { expect(EmailProcessor).toBeDefined(); });
    it('should export NotificationProcessor', () => { expect(NotificationProcessor).toBeDefined(); });
    it('should export ReportProcessor', () => { expect(ReportProcessor).toBeDefined(); });
    it('should export DataProcessor', () => { expect(DataProcessor).toBeDefined(); });
    it('should export WebhookProcessor', () => { expect(WebhookProcessor).toBeDefined(); });
    it('should export FileProcessor', () => { expect(FileProcessor).toBeDefined(); });
    it('should export AnalyticsProcessor', () => { expect(AnalyticsProcessor).toBeDefined(); });
    it('should export SearchProcessor', () => { expect(SearchProcessor).toBeDefined(); });
    it('should export PaymentProcessor', () => { expect(PaymentProcessor).toBeDefined(); });
    it('should export SubscriptionProcessor', () => { expect(SubscriptionProcessor).toBeDefined(); });
    it('should export AuditProcessor', () => { expect(AuditProcessor).toBeDefined(); });
  });

  describe('Processor Instances', () => {
    it('should export emailProcessor instance', async () => {
      const { emailProcessor } = await import('../src/core/jobs/emailProcessor.js');
      expect(emailProcessor).toBeDefined();
      expect(emailProcessor.getStats).toBeDefined();
    });

    it('should export notificationProcessor instance', async () => {
      const { notificationProcessor } = await import('../src/core/jobs/notificationProcessor.js');
      expect(notificationProcessor).toBeDefined();
      expect(notificationProcessor.getStats).toBeDefined();
    });

    it('should export reportProcessor instance', async () => {
      const { reportProcessor } = await import('../src/core/jobs/reportProcessor.js');
      expect(reportProcessor).toBeDefined();
      expect(reportProcessor.getStats).toBeDefined();
    });

    it('should export dataProcessor instance', async () => {
      const { dataProcessor } = await import('../src/core/jobs/dataProcessor.js');
      expect(dataProcessor).toBeDefined();
      expect(dataProcessor.getStats).toBeDefined();
    });

    it('should export webhookProcessor instance', async () => {
      const { webhookProcessor } = await import('../src/core/jobs/webhookProcessor.js');
      expect(webhookProcessor).toBeDefined();
      expect(webhookProcessor.getStats).toBeDefined();
    });

    it('should export fileProcessor instance', async () => {
      const { fileProcessor } = await import('../src/core/jobs/fileProcessor.js');
      expect(fileProcessor).toBeDefined();
      expect(fileProcessor.getStats).toBeDefined();
    });

    it('should export analyticsProcessor instance', async () => {
      const { analyticsProcessor } = await import('../src/core/jobs/analyticsProcessor.js');
      expect(analyticsProcessor).toBeDefined();
      expect(analyticsProcessor.getStats).toBeDefined();
    });

    it('should export searchProcessor instance', async () => {
      const { searchProcessor } = await import('../src/core/jobs/searchProcessor.js');
      expect(searchProcessor).toBeDefined();
      expect(searchProcessor.getStats).toBeDefined();
    });

    it('should export paymentProcessor instance', async () => {
      const { paymentProcessor } = await import('../src/core/jobs/paymentProcessor.js');
      expect(paymentProcessor).toBeDefined();
      expect(paymentProcessor.getStats).toBeDefined();
    });

    it('should export subscriptionProcessor instance', async () => {
      const { subscriptionProcessor } = await import('../src/core/jobs/subscriptionProcessor.js');
      expect(subscriptionProcessor).toBeDefined();
      expect(subscriptionProcessor.getStats).toBeDefined();
    });

    it('should export auditProcessor instance', async () => {
      const { auditProcessor } = await import('../src/core/jobs/auditProcessor.js');
      expect(auditProcessor).toBeDefined();
      expect(auditProcessor.getStats).toBeDefined();
    });
  });
});
