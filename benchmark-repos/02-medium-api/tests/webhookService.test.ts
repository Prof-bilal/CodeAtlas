import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookServiceImpl } from '../src/services/webhookService.js';
import { WebhookRepository } from '../src/database/repositories/webhookRepository.js';
import { eventBus } from '../src/events/eventBus.js';

vi.mock('../src/database/repositories/webhookRepository.js');
vi.mock('../src/events/eventBus.js');

describe('WebhookServiceImpl', () => {
  let service: WebhookServiceImpl;
  let mockWebhookRepository: any;

  beforeEach(() => {
    service = new WebhookServiceImpl();
    mockWebhookRepository = vi.mocked(WebhookRepository.prototype);
    vi.clearAllMocks();
  });

  describe('getWebhook', () => {
    it('should return webhook if found', async () => {
      const mockWebhook = { id: 'webhook-1', url: 'https://example.com' };
      mockWebhookRepository.findById.mockResolvedValue(mockWebhook);

      const result = await service.getWebhook('webhook-1');
      expect(result).toEqual(mockWebhook);
    });

    it('should throw error if webhook not found', async () => {
      mockWebhookRepository.findById.mockResolvedValue(null);

      await expect(service.getWebhook('webhook-1')).rejects.toThrow('Webhook not found');
    });
  });

  describe('createWebhook', () => {
    it('should create webhook successfully', async () => {
      const mockWebhook = { id: 'webhook-1', url: 'https://example.com', userId: 'user-1' };
      mockWebhookRepository.create.mockResolvedValue(mockWebhook);

      const result = await service.createWebhook({
        userId: 'user-1',
        url: 'https://example.com',
        events: ['task.created'],
      });

      expect(result).toEqual(mockWebhook);
    });
  });

  describe('deleteWebhook', () => {
    it('should delete webhook successfully', async () => {
      const mockWebhook = { id: 'webhook-1', url: 'https://example.com' };
      mockWebhookRepository.findById.mockResolvedValue(mockWebhook);
      mockWebhookRepository.delete.mockResolvedValue(true);

      const result = await service.deleteWebhook('webhook-1');
      expect(result).toBe(true);
    });
  });
});
