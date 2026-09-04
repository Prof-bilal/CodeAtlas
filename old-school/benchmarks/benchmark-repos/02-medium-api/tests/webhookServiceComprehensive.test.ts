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

  describe('getUserWebhooks', () => {
    it('should return user webhooks', async () => {
      const mockWebhooks = [{ id: 'webhook-1' }, { id: 'webhook-2' }];
      mockWebhookRepository.findByUserId.mockResolvedValue(mockWebhooks);

      const result = await service.getUserWebhooks('user-1');
      expect(result).toEqual(mockWebhooks);
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
      expect(mockWebhookRepository.create).toHaveBeenCalled();
    });
  });

  describe('updateWebhook', () => {
    it('should update webhook successfully', async () => {
      const mockWebhook = { id: 'webhook-1', url: 'https://example.com' };
      mockWebhookRepository.findById.mockResolvedValue(mockWebhook);
      mockWebhookRepository.update.mockResolvedValue({ ...mockWebhook, active: false });

      const result = await service.updateWebhook('webhook-1', { active: false });
      expect(result.active).toBe(false);
    });

    it('should throw error if webhook not found', async () => {
      mockWebhookRepository.findById.mockResolvedValue(null);

      await expect(service.updateWebhook('webhook-1', { active: false })).rejects.toThrow('Webhook not found');
    });
  });

  describe('deleteWebhook', () => {
    it('should delete webhook successfully', async () => {
      const mockWebhook = { id: 'webhook-1' };
      mockWebhookRepository.findById.mockResolvedValue(mockWebhook);
      mockWebhookRepository.delete.mockResolvedValue(true);

      const result = await service.deleteWebhook('webhook-1');
      expect(result).toBe(true);
      expect(mockWebhookRepository.delete).toHaveBeenCalledWith('webhook-1');
    });

    it('should throw error if webhook not found', async () => {
      mockWebhookRepository.findById.mockResolvedValue(null);

      await expect(service.deleteWebhook('webhook-1')).rejects.toThrow('Webhook not found');
    });
  });
});
