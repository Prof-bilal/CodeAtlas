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
import { databaseService } from '../src/database/databaseService.js';
import { migrationRunner } from '../src/database/migrations.js';

describe('Database Module', () => {
  describe('Repositories', () => {
    it('should have all repositories defined', () => {
      expect(UserRepository).toBeDefined();
      expect(TaskRepository).toBeDefined();
      expect(PaymentRepository).toBeDefined();
      expect(SubscriptionRepository).toBeDefined();
      expect(NotificationRepository).toBeDefined();
      expect(AuditRepository).toBeDefined();
      expect(ApiKeyRepository).toBeDefined();
      expect(FileRepository).toBeDefined();
      expect(WebhookRepository).toBeDefined();
    });
  });

  describe('DatabaseService', () => {
    it('should be defined', () => {
      expect(databaseService).toBeDefined();
    });

    it('should have query method', () => {
      expect(databaseService.query).toBeDefined();
    });

    it('should have connect method', () => {
      expect(databaseService.connect).toBeDefined();
    });

    it('should have close method', () => {
      expect(databaseService.close).toBeDefined();
    });

    it('should have healthCheck method', () => {
      expect(databaseService.healthCheck).toBeDefined();
    });

    it('should have getPoolStats method', () => {
      expect(databaseService.getPoolStats).toBeDefined();
    });
  });

  describe('MigrationRunner', () => {
    it('should be defined', () => {
      expect(migrationRunner).toBeDefined();
    });

    it('should have runMigrations method', () => {
      expect(migrationRunner.runMigrations).toBeDefined();
    });

    it('should have rollbackMigration method', () => {
      expect(migrationRunner.rollbackMigration).toBeDefined();
    });

    it('should have getPendingMigrations method', () => {
      expect(migrationRunner.getPendingMigrations).toBeDefined();
    });

    it('should have pending migrations', () => {
      const pending = migrationRunner.getPendingMigrations();
      expect(pending.length).toBeGreaterThan(0);
    });
  });
});
