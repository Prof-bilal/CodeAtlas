import { describe, it, expect } from 'vitest';
import { UserServiceImpl } from '../src/services/userService.js';
import { TaskServiceImpl } from '../src/services/taskService.js';
import { PaymentServiceImpl } from '../src/services/paymentService.js';
import { SubscriptionServiceImpl } from '../src/services/subscriptionService.js';
import { NotificationServiceImpl } from '../src/services/notificationService.js';
import { AuditServiceImpl } from '../src/services/auditService.js';
import { ApiKeyServiceImpl } from '../src/services/apiKeyService.js';
import { FileServiceImpl } from '../src/services/fileService.js';
import { WebhookServiceImpl } from '../src/services/webhookService.js';
import { SearchServiceImpl } from '../src/services/searchService.js';
import { CacheService } from '../src/services/cacheService.js';

describe('Service Definitions', () => {
  it('should export UserServiceImpl', () => {
    expect(UserServiceImpl).toBeDefined();
  });

  it('should export TaskServiceImpl', () => {
    expect(TaskServiceImpl).toBeDefined();
  });

  it('should export PaymentServiceImpl', () => {
    expect(PaymentServiceImpl).toBeDefined();
  });

  it('should export SubscriptionServiceImpl', () => {
    expect(SubscriptionServiceImpl).toBeDefined();
  });

  it('should export NotificationServiceImpl', () => {
    expect(NotificationServiceImpl).toBeDefined();
  });

  it('should export AuditServiceImpl', () => {
    expect(AuditServiceImpl).toBeDefined();
  });

  it('should export ApiKeyServiceImpl', () => {
    expect(ApiKeyServiceImpl).toBeDefined();
  });

  it('should export FileServiceImpl', () => {
    expect(FileServiceImpl).toBeDefined();
  });

  it('should export WebhookServiceImpl', () => {
    expect(WebhookServiceImpl).toBeDefined();
  });

  it('should export SearchServiceImpl', () => {
    expect(SearchServiceImpl).toBeDefined();
  });

  it('should export CacheService', () => {
    expect(CacheService).toBeDefined();
  });
});
