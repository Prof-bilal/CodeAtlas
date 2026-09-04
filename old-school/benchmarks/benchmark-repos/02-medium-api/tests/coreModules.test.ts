import { describe, it, expect } from 'vitest';
import { WorkflowEngine, workflowEngine } from '../src/core/workflows/workflowEngine.js';
import { IntegrationManager, integrationManager } from '../src/core/integrations/integrationManager.js';
import { DashboardManager, dashboardManager } from '../src/core/dashboards/dashboardManager.js';
import { ReportGenerator, reportGenerator } from '../src/core/reports/reportGenerator.js';

describe('Core Modules', () => {
  describe('WorkflowEngine', () => {
    it('should export class', () => { expect(WorkflowEngine).toBeDefined(); });
    it('should export singleton', () => { expect(workflowEngine).toBeDefined(); });
  });

  describe('IntegrationManager', () => {
    it('should export class', () => { expect(IntegrationManager).toBeDefined(); });
    it('should export singleton', () => { expect(integrationManager).toBeDefined(); });
  });

  describe('DashboardManager', () => {
    it('should export class', () => { expect(DashboardManager).toBeDefined(); });
    it('should export singleton', () => { expect(dashboardManager).toBeDefined(); });
  });

  describe('ReportGenerator', () => {
    it('should export class', () => { expect(ReportGenerator).toBeDefined(); });
    it('should export singleton', () => { expect(reportGenerator).toBeDefined(); });
  });
});

describe('Event System', () => {
  it('should have event bus', () => {
    const { eventBus } = require('../src/events/eventBus.js');
    expect(eventBus).toBeDefined();
  });

  it('should have all handlers', () => {
    const userHandlers = require('../src/events/handlers/userHandlers.js');
    expect(userHandlers.UserRegisteredHandler).toBeDefined();
    expect(userHandlers.PasswordChangedHandler).toBeDefined();

    const taskHandlers = require('../src/events/handlers/taskHandlers.js');
    expect(taskHandlers.TaskCreatedHandler).toBeDefined();
    expect(taskHandlers.TaskCompletedHandler).toBeDefined();

    const paymentHandlers = require('../src/events/handlers/paymentHandlers.js');
    expect(paymentHandlers.PaymentSuccessHandler).toBeDefined();

    const subscriptionHandlers = require('../src/events/handlers/subscriptionHandlers.js');
    expect(subscriptionHandlers.SubscriptionCreatedHandler).toBeDefined();

    const notificationHandlers = require('../src/events/handlers/notificationHandlers.js');
    expect(notificationHandlers.NotificationCreatedHandler).toBeDefined();

    const securityHandlers = require('../src/events/handlers/securityHandlers.js');
    expect(securityHandlers.SecurityAlertHandler).toBeDefined();

    const auditHandlers = require('../src/events/handlers/auditHandlers.js');
    expect(auditHandlers.AuditLogCreatedHandler).toBeDefined();

    const fileHandlers = require('../src/events/handlers/fileHandlers.js');
    expect(fileHandlers.FileUploadedHandler).toBeDefined();

    const searchHandlers = require('../src/events/handlers/searchHandlers.js');
    expect(searchHandlers.SearchIndexedHandler).toBeDefined();
  });
});
