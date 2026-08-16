import { describe, it, expect } from 'vitest';
import { emailTemplates, renderTemplate } from '../src/core/notifications/emailTemplates.js';
import { emailProcessor } from '../src/core/jobs/emailProcessor.js';
import { notificationProcessor } from '../src/core/jobs/notificationProcessor.js';
import { reportProcessor } from '../src/core/jobs/reportProcessor.js';
import { dataProcessor } from '../src/core/jobs/dataProcessor.js';
import { webhookProcessor } from '../src/core/jobs/webhookProcessor.js';
import { fileProcessor } from '../src/core/jobs/fileProcessor.js';
import { analyticsProcessor } from '../src/core/jobs/analyticsProcessor.js';
import { searchProcessor } from '../src/core/jobs/searchProcessor.js';
import { paymentProcessor } from '../src/core/jobs/paymentProcessor.js';
import { subscriptionProcessor } from '../src/core/jobs/subscriptionProcessor.js';
import { auditProcessor } from '../src/core/jobs/auditProcessor.js';

describe('Singleton Definitions', () => {
  it('should export emailTemplates', () => {
    expect(emailTemplates).toBeDefined();
    expect(Object.keys(emailTemplates).length).toBeGreaterThan(0);
  });

  it('should export renderTemplate', () => {
    expect(renderTemplate).toBeDefined();
  });

  it('should export emailProcessor', () => {
    expect(emailProcessor).toBeDefined();
  });

  it('should export notificationProcessor', () => {
    expect(notificationProcessor).toBeDefined();
  });

  it('should export reportProcessor', () => {
    expect(reportProcessor).toBeDefined();
  });

  it('should export dataProcessor', () => {
    expect(dataProcessor).toBeDefined();
  });

  it('should export webhookProcessor', () => {
    expect(webhookProcessor).toBeDefined();
  });

  it('should export fileProcessor', () => {
    expect(fileProcessor).toBeDefined();
  });

  it('should export analyticsProcessor', () => {
    expect(analyticsProcessor).toBeDefined();
  });

  it('should export searchProcessor', () => {
    expect(searchProcessor).toBeDefined();
  });

  it('should export paymentProcessor', () => {
    expect(paymentProcessor).toBeDefined();
  });

  it('should export subscriptionProcessor', () => {
    expect(subscriptionProcessor).toBeDefined();
  });

  it('should export auditProcessor', () => {
    expect(auditProcessor).toBeDefined();
  });
});
