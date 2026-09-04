import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookService } from '../../src/core/webhooks/webhookService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    webhookService = new WebhookService(mockEventBus);
  });

  describe('createWebhook', () => {
    it('should create a webhook', async () => {
      const webhook = await webhookService.createWebhook({
        userId: 'user-1',
        url: 'https://example.com/hook',
        events: ['task.created'],
        active: true,
        metadata: {},
      });

      expect(webhook.id).toBeDefined();
      expect(webhook.secret).toBeDefined();
      expect(webhook.url).toBe('https://example.com/hook');
    });
  });

  describe('deleteWebhook', () => {
    it('should delete webhook', async () => {
      const webhook = await webhookService.createWebhook({
        userId: 'user-1',
        url: 'https://example.com/hook',
        events: [],
        active: true,
        metadata: {},
      });

      await webhookService.deleteWebhook(webhook.id);
      await expect(webhookService.getWebhook(webhook.id)).rejects.toThrow('Webhook not found');
    });
  });

  describe('updateWebhook', () => {
    it('should update webhook', async () => {
      const webhook = await webhookService.createWebhook({
        userId: 'user-1',
        url: 'https://example.com/hook',
        events: [],
        active: true,
        metadata: {},
      });

      const updated = await webhookService.updateWebhook(webhook.id, { url: 'https://new.com/hook' });
      expect(updated.url).toBe('https://new.com/hook');
    });
  });

  describe('getWebhookLogs', () => {
    it('should return logs for webhook', async () => {
      const logs = await webhookService.getWebhookLogs('non-existent');
      expect(logs).toEqual([]);
    });
  });
});
