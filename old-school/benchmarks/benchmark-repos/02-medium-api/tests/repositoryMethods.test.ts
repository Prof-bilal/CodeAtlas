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

describe('Repository Method Definitions', () => {
  describe('UserRepository', () => {
    it('should have findById method', () => { expect(UserRepository.prototype.findById).toBeDefined(); });
    it('should have findByEmail method', () => { expect(UserRepository.prototype.findByEmail).toBeDefined(); });
    it('should have create method', () => { expect(UserRepository.prototype.create).toBeDefined(); });
    it('should have update method', () => { expect(UserRepository.prototype.update).toBeDefined(); });
    it('should have delete method', () => { expect(UserRepository.prototype.delete).toBeDefined(); });
    it('should have findAll method', () => { expect(UserRepository.prototype.findAll).toBeDefined(); });
    it('should have count method', () => { expect(UserRepository.prototype.count).toBeDefined(); });
    it('should have existsByEmail method', () => { expect(UserRepository.prototype.existsByEmail).toBeDefined(); });
  });

  describe('TaskRepository', () => {
    it('should have findById method', () => { expect(TaskRepository.prototype.findById).toBeDefined(); });
    it('should have create method', () => { expect(TaskRepository.prototype.create).toBeDefined(); });
    it('should have update method', () => { expect(TaskRepository.prototype.update).toBeDefined(); });
    it('should have delete method', () => { expect(TaskRepository.prototype.delete).toBeDefined(); });
    it('should have findByUserId method', () => { expect(TaskRepository.prototype.findByUserId).toBeDefined(); });
    it('should have findByAssignedTo method', () => { expect(TaskRepository.prototype.findByAssignedTo).toBeDefined(); });
    it('should have count method', () => { expect(TaskRepository.prototype.count).toBeDefined(); });
    it('should have findOverdue method', () => { expect(TaskRepository.prototype.findOverdue).toBeDefined(); });
  });

  describe('PaymentRepository', () => {
    it('should have findById method', () => { expect(PaymentRepository.prototype.findById).toBeDefined(); });
    it('should have create method', () => { expect(PaymentRepository.prototype.create).toBeDefined(); });
    it('should have updateStatus method', () => { expect(PaymentRepository.prototype.updateStatus).toBeDefined(); });
    it('should have findByUserId method', () => { expect(PaymentRepository.prototype.findByUserId).toBeDefined(); });
    it('should have findByStripePaymentId method', () => { expect(PaymentRepository.prototype.findByStripePaymentId).toBeDefined(); });
    it('should have sumByUserId method', () => { expect(PaymentRepository.prototype.sumByUserId).toBeDefined(); });
    it('should have count method', () => { expect(PaymentRepository.prototype.count).toBeDefined(); });
  });

  describe('SubscriptionRepository', () => {
    it('should have findById method', () => { expect(SubscriptionRepository.prototype.findById).toBeDefined(); });
    it('should have findByUserId method', () => { expect(SubscriptionRepository.prototype.findByUserId).toBeDefined(); });
    it('should have create method', () => { expect(SubscriptionRepository.prototype.create).toBeDefined(); });
    it('should have update method', () => { expect(SubscriptionRepository.prototype.update).toBeDefined(); });
    it('should have cancel method', () => { expect(SubscriptionRepository.prototype.cancel).toBeDefined(); });
    it('should have findExpiringSoon method', () => { expect(SubscriptionRepository.prototype.findExpiringSoon).toBeDefined(); });
    it('should have count method', () => { expect(SubscriptionRepository.prototype.count).toBeDefined(); });
  });

  describe('NotificationRepository', () => {
    it('should have findById method', () => { expect(NotificationRepository.prototype.findById).toBeDefined(); });
    it('should have create method', () => { expect(NotificationRepository.prototype.create).toBeDefined(); });
    it('should have markAsRead method', () => { expect(NotificationRepository.prototype.markAsRead).toBeDefined(); });
    it('should have markAllAsRead method', () => { expect(NotificationRepository.prototype.markAllAsRead).toBeDefined(); });
    it('should have findByUserId method', () => { expect(NotificationRepository.prototype.findByUserId).toBeDefined(); });
    it('should have countUnread method', () => { expect(NotificationRepository.prototype.countUnread).toBeDefined(); });
    it('should have delete method', () => { expect(NotificationRepository.prototype.delete).toBeDefined(); });
    it('should have deleteOlderThan method', () => { expect(NotificationRepository.prototype.deleteOlderThan).toBeDefined(); });
  });

  describe('AuditRepository', () => {
    it('should have create method', () => { expect(AuditRepository.prototype.create).toBeDefined(); });
    it('should have findByUserId method', () => { expect(AuditRepository.prototype.findByUserId).toBeDefined(); });
    it('should have findByResource method', () => { expect(AuditRepository.prototype.findByResource).toBeDefined(); });
    it('should have findByAction method', () => { expect(AuditRepository.prototype.findByAction).toBeDefined(); });
    it('should have count method', () => { expect(AuditRepository.prototype.count).toBeDefined(); });
    it('should have deleteOlderThan method', () => { expect(AuditRepository.prototype.deleteOlderThan).toBeDefined(); });
  });

  describe('ApiKeyRepository', () => {
    it('should have findById method', () => { expect(ApiKeyRepository.prototype.findById).toBeDefined(); });
    it('should have findByKeyHash method', () => { expect(ApiKeyRepository.prototype.findByKeyHash).toBeDefined(); });
    it('should have create method', () => { expect(ApiKeyRepository.prototype.create).toBeDefined(); });
    it('should have updateLastUsed method', () => { expect(ApiKeyRepository.prototype.updateLastUsed).toBeDefined(); });
    it('should have delete method', () => { expect(ApiKeyRepository.prototype.delete).toBeDefined(); });
    it('should have findByUserId method', () => { expect(ApiKeyRepository.prototype.findByUserId).toBeDefined(); });
    it('should have count method', () => { expect(ApiKeyRepository.prototype.count).toBeDefined(); });
  });

  describe('FileRepository', () => {
    it('should have findById method', () => { expect(FileRepository.prototype.findById).toBeDefined(); });
    it('should have create method', () => { expect(FileRepository.prototype.create).toBeDefined(); });
    it('should have delete method', () => { expect(FileRepository.prototype.delete).toBeDefined(); });
    it('should have findByUserId method', () => { expect(FileRepository.prototype.findByUserId).toBeDefined(); });
    it('should have getTotalSize method', () => { expect(FileRepository.prototype.getTotalSize).toBeDefined(); });
    it('should have count method', () => { expect(FileRepository.prototype.count).toBeDefined(); });
  });

  describe('WebhookRepository', () => {
    it('should have findById method', () => { expect(WebhookRepository.prototype.findById).toBeDefined(); });
    it('should have create method', () => { expect(WebhookRepository.prototype.create).toBeDefined(); });
    it('should have update method', () => { expect(WebhookRepository.prototype.update).toBeDefined(); });
    it('should have delete method', () => { expect(WebhookRepository.prototype.delete).toBeDefined(); });
    it('should have findByUserId method', () => { expect(WebhookRepository.prototype.findByUserId).toBeDefined(); });
    it('should have findByEvent method', () => { expect(WebhookRepository.prototype.findByEvent).toBeDefined(); });
    it('should have updateLastTriggered method', () => { expect(WebhookRepository.prototype.updateLastTriggered).toBeDefined(); });
  });
});
