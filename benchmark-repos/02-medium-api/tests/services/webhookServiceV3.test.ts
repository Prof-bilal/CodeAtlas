import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookService } from '../../src/services/webhookService.js';
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
    it('should create webhook', async () => {
      const webhook = await webhookService.createWebhook({
        userId: 'user-1',
        url: 'https://example.com/hook',
        events: ['task.created'],
        active: true,
        metadata: {},
      });
      expect(webhook.id).toBeDefined();
      expect(webhook.secret).toBeDefined();
    });
  });

  describe('getWebhookLogs', () => {
    it('should return logs', async () => {
      const logs = await webhookService.getWebhookLogs('nonexistent');
      expect(logs).toEqual([]);
    });
  });
});
