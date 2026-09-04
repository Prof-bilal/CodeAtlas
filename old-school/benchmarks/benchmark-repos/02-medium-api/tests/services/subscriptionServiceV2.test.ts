import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionService } from '../../src/core/subscriptions/subscriptionService.js';
import { SubscriptionRepository } from '../../src/database/repositories/subscriptionRepository.js';
import { StripeService } from '../../src/core/payments/stripeService.js';
import { EventBus } from '../../src/events/eventBus.js';
import { cacheService } from '../../src/services/cacheService.js';

vi.mock('../../src/database/repositories/subscriptionRepository.js');
vi.mock('../../src/core/payments/stripeService.js');
vi.mock('../../src/events/eventBus.js');
vi.mock('../../src/services/cacheService.js');

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;
  let mockSubscriptionRepository: any;
  let mockStripeService: any;
  let mockEventBus: any;
  let mockCacheService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionRepository = {
      findByUser: vi.fn(),
      getExpiringSoon: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    mockStripeService = {
      createSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      updateSubscription: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
    };
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    subscriptionService = new SubscriptionService(
      mockSubscriptionRepository,
      mockStripeService,
      mockEventBus,
      mockCacheService
    );
  });

  describe('createSubscription', () => {
    it('should create subscription via Stripe', async () => {
      const subData = { userId: 'user-1', planId: 'plan_123' };
      const mockSub = { id: 'sub-1', ...subData, status: 'active' };
      const mockStripeSub = { id: 'stripe_sub_123', status: 'active' };
      
      mockStripeService.createSubscription.mockResolvedValue(mockStripeSub);
      mockSubscriptionRepository.create.mockResolvedValue(mockSub);

      const result = await subscriptionService.createSubscription(subData);

      expect(mockStripeService.createSubscription).toHaveBeenCalledWith(subData.planId);
      expect(mockEventBus.emit).toHaveBeenCalledWith('subscription:created', expect.any(Object));
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription via Stripe', async () => {
      const subId = 'sub-123';
      const mockSub = { id: subId, stripeSubscriptionId: 'stripe_sub_123' };
      
      mockSubscriptionRepository.findById.mockResolvedValue(mockSub);
      mockStripeService.cancelSubscription.mockResolvedValue({ status: 'canceled' });
      mockSubscriptionRepository.update.mockResolvedValue({ ...mockSub, status: 'canceled' });

      const result = await subscriptionService.cancelSubscription(subId);

      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith('stripe_sub_123');
      expect(mockEventBus.emit).toHaveBeenCalledWith('subscription:canceled', expect.any(Object));
    });
  });

  describe('getExpiringSoon', () => {
    it('should return subscriptions expiring within days', async () => {
      const mockSubs = [
        { id: 'sub-1', expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
      ];
      mockSubscriptionRepository.getExpiringSoon.mockResolvedValue(mockSubs);

      const result = await subscriptionService.getExpiringSoon(7);

      expect(result).toEqual(mockSubs);
      expect(mockSubscriptionRepository.getExpiringSoon).toHaveBeenCalledWith(7);
    });
  });
});
