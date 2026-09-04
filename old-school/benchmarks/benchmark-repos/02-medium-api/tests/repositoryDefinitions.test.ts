import { describe, it, expect } from 'vitest';
import { UserRepository } from '../src/database/repositories/userRepository.js';
import { TaskRepository } from '../src/database/repositories/taskRepository.js';
import { PaymentRepository } from '../src/database/repositories/paymentRepository.js';
import { SubscriptionRepository } from '../src/database/repositories/subscriptionRepository.js';
import { NotificationRepository } from '../src/database/repositories/notificationRepository.js';
import { AuditRepository } from '../src/database/repositories/auditRepository.js';
import { ApiKeyRepository } from '../src/database/repositories/apiKeyRepository.js';
import { FileRepository } from '../src/database/repositories/fileRepository.js';
import { WebhookRepository } from '../src/database/repositories/webhookRepository.js';

describe('Repository Definitions', () => {
  it('should export UserRepository', () => {
    expect(UserRepository).toBeDefined();
  });

  it('should export TaskRepository', () => {
    expect(TaskRepository).toBeDefined();
  });

  it('should export PaymentRepository', () => {
    expect(PaymentRepository).toBeDefined();
  });

  it('should export SubscriptionRepository', () => {
    expect(SubscriptionRepository).toBeDefined();
  });

  it('should export NotificationRepository', () => {
    expect(NotificationRepository).toBeDefined();
  });

  it('should export AuditRepository', () => {
    expect(AuditRepository).toBeDefined();
  });

  it('should export ApiKeyRepository', () => {
    expect(ApiKeyRepository).toBeDefined();
  });

  it('should export FileRepository', () => {
    expect(FileRepository).toBeDefined();
  });

  it('should export WebhookRepository', () => {
    expect(WebhookRepository).toBeDefined();
  });
});
