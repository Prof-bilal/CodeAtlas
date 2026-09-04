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

describe('Processor Definitions', () => {
  it('should export EmailProcessor', () => {
    expect(EmailProcessor).toBeDefined();
  });

  it('should export NotificationProcessor', () => {
    expect(NotificationProcessor).toBeDefined();
  });

  it('should export ReportProcessor', () => {
    expect(ReportProcessor).toBeDefined();
  });

  it('should export DataProcessor', () => {
    expect(DataProcessor).toBeDefined();
  });

  it('should export WebhookProcessor', () => {
    expect(WebhookProcessor).toBeDefined();
  });

  it('should export FileProcessor', () => {
    expect(FileProcessor).toBeDefined();
  });

  it('should export AnalyticsProcessor', () => {
    expect(AnalyticsProcessor).toBeDefined();
  });

  it('should export SearchProcessor', () => {
    expect(SearchProcessor).toBeDefined();
  });

  it('should export PaymentProcessor', () => {
    expect(PaymentProcessor).toBeDefined();
  });

  it('should export SubscriptionProcessor', () => {
    expect(SubscriptionProcessor).toBeDefined();
  });

  it('should export AuditProcessor', () => {
    expect(AuditProcessor).toBeDefined();
  });
});
