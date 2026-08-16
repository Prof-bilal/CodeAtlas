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

  describe('getUserSubscription', () => {
    it('should return user subscription', async () => {
      const mockSubscription = { id: 'sub-1', userId: 'user-1' };
      mockSubscriptionRepository.findByUserId.mockResolvedValue(mockSubscription);

      const result = await service.getUserSubscription('user-1');
      expect(result).toEqual(mockSubscription);
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
      expect(mockSubscriptionRepository.create).toHaveBeenCalled();
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

    it('should throw error if subscription not found', async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(null);

      await expect(service.cancelSubscription('sub-1')).rejects.toThrow('Subscription not found');
    });
  });

  describe('renewSubscription', () => {
    it('should renew subscription successfully', async () => {
      const mockSubscription = { 
        id: 'sub-1', 
        planId: 'pro', 
        userId: 'user-1',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      };
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);
      mockSubscriptionRepository.update.mockResolvedValue({ ...mockSubscription, status: 'active' });
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.renewSubscription('sub-1');
      expect(result.status).toBe('active');
    });
  });

  describe('upgradeSubscription', () => {
    it('should upgrade subscription successfully', async () => {
      const mockSubscription = { id: 'sub-1', planId: 'basic', userId: 'user-1' };
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);
      mockSubscriptionRepository.update.mockResolvedValue({ ...mockSubscription, planId: 'enterprise' });
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.upgradeSubscription('sub-1', 'enterprise');
      expect(result.planId).toBe('enterprise');
    });
  });

  describe('getExpiringSoon', () => {
    it('should return expiring subscriptions', async () => {
      const mockSubscriptions = [{ id: 'sub-1' }, { id: 'sub-2' }];
      mockSubscriptionRepository.findExpiringSoon.mockResolvedValue(mockSubscriptions);

      const result = await service.getExpiringSoon(7);
      expect(result).toEqual(mockSubscriptions);
    });
  });
});
