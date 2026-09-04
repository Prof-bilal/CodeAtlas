import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookService } from '../../src/services/webhookService.js';
import { WebhookRepository } from '../../src/database/repositories/webhookRepository.js';
import { EventBus } from '../../src/events/eventBus.js';
import { cacheService } from '../../src/services/cacheService.js';

vi.mock('../../src/database/repositories/webhookRepository.js');
vi.mock('../../src/events/eventBus.js');
vi.mock('../../src/services/cacheService.js');

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let mockWebhookRepository: any;
  let mockEventBus: any;
  let mockCacheService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWebhookRepository = {
      findByUser: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getLogs: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
    };
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    webhookService = new WebhookService(mockWebhookRepository, mockEventBus, mockCacheService);
  });

  describe('createWebhook', () => {
    it('should create webhook and emit event', async () => {
      const webhookData = {
        userId: 'user-1',
        url: 'https://example.com/webhook',
        events: ['task.created'],
        secret: 'secret123',
      };
      const mockWebhook = { id: 'webhook-1', ...webhookData, createdAt: new Date() };
      mockWebhookRepository.create.mockResolvedValue(mockWebhook);

      const result = await webhookService.createWebhook(webhookData);

      expect(result).toEqual(mockWebhook);
      expect(mockEventBus.emit).toHaveBeenCalledWith('webhook:created', { webhook: mockWebhook });
      expect(mockCacheService.invalidate).toHaveBeenCalled();
    });
  });

  describe('testWebhook', () => {
    it('should send test payload to webhook URL', async () => {
      const webhookId = 'webhook-123';
      const mockWebhook = { id: webhookId, url: 'https://example.com/webhook', secret: 'secret123' };
      mockWebhookRepository.findById.mockResolvedValue(mockWebhook);

      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = mockFetch;

      const result = await webhookService.testWebhook(webhookId);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith('webhook:test:success', { webhookId });
    });
  });

  describe('getWebhookLogs', () => {
    it('should return webhook delivery logs', async () => {
      const webhookId = 'webhook-123';
      const mockLogs = [
        { id: 'log-1', webhookId, status: 200, deliveredAt: new Date() },
        { id: 'log-2', webhookId, status: 500, deliveredAt: new Date() },
      ];
      mockWebhookRepository.getLogs.mockResolvedValue(mockLogs);

      const result = await webhookService.getWebhookLogs(webhookId);

      expect(result).toEqual(mockLogs);
    });
  });
});
