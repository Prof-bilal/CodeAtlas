import { describe, it, expect } from 'vitest';
import { healthController } from '../src/controllers/healthController.js';
import { userController } from '../src/controllers/userController.js';
import { taskController } from '../src/controllers/taskController.js';
import { paymentController } from '../src/controllers/paymentController.js';
import { subscriptionController } from '../src/controllers/subscriptionController.js';
import { notificationController } from '../src/controllers/notificationController.js';
import { apiKeyController } from '../src/controllers/apiKeyController.js';
import { fileController } from '../src/controllers/fileController.js';
import { webhookController } from '../src/controllers/webhookController.js';

describe('Controller Definitions', () => {
  it('should export healthController', () => { expect(healthController).toBeDefined(); });
  it('should export userController', () => { expect(userController).toBeDefined(); });
  it('should export taskController', () => { expect(taskController).toBeDefined(); });
  it('should export paymentController', () => { expect(paymentController).toBeDefined(); });
  it('should export subscriptionController', () => { expect(subscriptionController).toBeDefined(); });
  it('should export notificationController', () => { expect(notificationController).toBeDefined(); });
  it('should export apiKeyController', () => { expect(apiKeyController).toBeDefined(); });
  it('should export fileController', () => { expect(fileController).toBeDefined(); });
  it('should export webhookController', () => { expect(webhookController).toBeDefined(); });
});

describe('Health Controller Methods', () => {
  it('should have check method', () => { expect(healthController.check).toBeDefined(); });
  it('should have ready method', () => { expect(healthController.ready).toBeDefined(); });
  it('should have live method', () => { expect(healthController.live).toBeDefined(); });
  it('should have metrics method', () => { expect(healthController.metrics).toBeDefined(); });
});

describe('User Controller Methods', () => {
  it('should have getProfile method', () => { expect(userController.getProfile).toBeDefined(); });
  it('should have updateProfile method', () => { expect(userController.updateProfile).toBeDefined(); });
  it('should have deleteProfile method', () => { expect(userController.deleteProfile).toBeDefined(); });
  it('should have getUser method', () => { expect(userController.getUser).toBeDefined(); });
});

describe('Task Controller Methods', () => {
  it('should have getTasks method', () => { expect(taskController.getTasks).toBeDefined(); });
  it('should have getTask method', () => { expect(taskController.getTask).toBeDefined(); });
  it('should have createTask method', () => { expect(taskController.createTask).toBeDefined(); });
  it('should have updateTask method', () => { expect(taskController.updateTask).toBeDefined(); });
  it('should have deleteTask method', () => { expect(taskController.deleteTask).toBeDefined(); });
  it('should have completeTask method', () => { expect(taskController.completeTask).toBeDefined(); });
  it('should have assignTask method', () => { expect(taskController.assignTask).toBeDefined(); });
  it('should have getOverdueTasks method', () => { expect(taskController.getOverdueTasks).toBeDefined(); });
});

describe('Payment Controller Methods', () => {
  it('should have getPayments method', () => { expect(paymentController.getPayments).toBeDefined(); });
  it('should have getPayment method', () => { expect(paymentController.getPayment).toBeDefined(); });
  it('should have createPayment method', () => { expect(paymentController.createPayment).toBeDefined(); });
  it('should have processPayment method', () => { expect(paymentController.processPayment).toBeDefined(); });
  it('should have refundPayment method', () => { expect(paymentController.refundPayment).toBeDefined(); });
  it('should have getTotalByUser method', () => { expect(paymentController.getTotalByUser).toBeDefined(); });
});

describe('Subscription Controller Methods', () => {
  it('should have getSubscription method', () => { expect(subscriptionController.getSubscription).toBeDefined(); });
  it('should have getSubscriptionById method', () => { expect(subscriptionController.getSubscriptionById).toBeDefined(); });
  it('should have createSubscription method', () => { expect(subscriptionController.createSubscription).toBeDefined(); });
  it('should have cancelSubscription method', () => { expect(subscriptionController.cancelSubscription).toBeDefined(); });
  it('should have renewSubscription method', () => { expect(subscriptionController.renewSubscription).toBeDefined(); });
  it('should have upgradeSubscription method', () => { expect(subscriptionController.upgradeSubscription).toBeDefined(); });
  it('should have getExpiringSoon method', () => { expect(subscriptionController.getExpiringSoon).toBeDefined(); });
});

describe('Notification Controller Methods', () => {
  it('should have getNotifications method', () => { expect(notificationController.getNotifications).toBeDefined(); });
  it('should have getNotification method', () => { expect(notificationController.getNotification).toBeDefined(); });
  it('should have markAsRead method', () => { expect(notificationController.markAsRead).toBeDefined(); });
  it('should have markAllAsRead method', () => { expect(notificationController.markAllAsRead).toBeDefined(); });
  it('should have getUnreadCount method', () => { expect(notificationController.getUnreadCount).toBeDefined(); });
  it('should have deleteNotification method', () => { expect(notificationController.deleteNotification).toBeDefined(); });
});

describe('ApiKey Controller Methods', () => {
  it('should have getApiKeys method', () => { expect(apiKeyController.getApiKeys).toBeDefined(); });
  it('should have getApiKey method', () => { expect(apiKeyController.getApiKey).toBeDefined(); });
  it('should have createApiKey method', () => { expect(apiKeyController.createApiKey).toBeDefined(); });
  it('should have revokeApiKey method', () => { expect(apiKeyController.revokeApiKey).toBeDefined(); });
});

describe('File Controller Methods', () => {
  it('should have getFiles method', () => { expect(fileController.getFiles).toBeDefined(); });
  it('should have getFile method', () => { expect(fileController.getFile).toBeDefined(); });
  it('should have uploadFile method', () => { expect(fileController.uploadFile).toBeDefined(); });
  it('should have deleteFile method', () => { expect(fileController.deleteFile).toBeDefined(); });
  it('should have getStorageUsage method', () => { expect(fileController.getStorageUsage).toBeDefined(); });
});

describe('Webhook Controller Methods', () => {
  it('should have getWebhooks method', () => { expect(webhookController.getWebhooks).toBeDefined(); });
  it('should have getWebhook method', () => { expect(webhookController.getWebhook).toBeDefined(); });
  it('should have createWebhook method', () => { expect(webhookController.createWebhook).toBeDefined(); });
  it('should have updateWebhook method', () => { expect(webhookController.updateWebhook).toBeDefined(); });
  it('should have deleteWebhook method', () => { expect(webhookController.deleteWebhook).toBeDefined(); });
});
