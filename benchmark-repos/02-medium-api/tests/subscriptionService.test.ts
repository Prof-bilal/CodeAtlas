import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionServiceImpl } from '../src/services/subscriptionService.js';
import { SubscriptionRepository } from '../src/database/repositories/subscriptionRepository.js';
import { eventBus } from '../src/events/eventBus.js';

vi.mock('../src/database/repositories/subscriptionRepository.js');
vi.mock('../src/events/eventBus.js');

describe('SubscriptionServiceImpl', () => {
  let service: SubscriptionServiceImpl;
  let mockSubscriptionRepository: any;

  beforeEach(() => {
    service = new SubscriptionServiceImpl();
    mockSubscriptionRepository = vi.mocked(SubscriptionRepository.prototype);
    vi.clearAllMocks();
  });

  describe('getSubscription', () => {
    it('should return subscription if found', async () => {
      const mockSubscription = { id: 'sub-1', planId: 'pro' };
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);

      const result = await service.getSubscription('sub-1');
      expect(result).toEqual(mockSubscription);
    });

    it('should throw error if subscription not found', async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(null);

      await expect(service.getSubscription('sub-1')).rejects.toThrow('Subscription not found');
    });
  });

  describe('createSubscription', () => {
    it('should create subscription successfully', async () => {
      const mockSubscription = { id: 'sub-1', planId: 'pro', userId: 'user-1' };
      mockSubscriptionRepository.create.mockResolvedValue(mockSubscription);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.createSubscription({
        userId: 'user-1',
        planId: 'pro',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      });

      expect(result).toEqual(mockSubscription);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      const mockSubscription = { id: 'sub-1', planId: 'pro', userId: 'user-1' };
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);
      mockSubscriptionRepository.cancel.mockResolvedValue({ ...mockSubscription, status: 'canceled' });
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.cancelSubscription('sub-1');
      expect(result.status).toBe('canceled');
    });
  });
});
