import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionService } from '../src/services/subscriptionService.js';
import { subscriptionRepository } from '../src/repositories/subscriptionRepository.js';
import { userRepository } from '../src/repositories/userRepository.js';
import { AppError } from '../src/services/authService.js';

vi.mock('../src/repositories/subscriptionRepository.js');
vi.mock('../src/repositories/userRepository.js');

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;

  beforeEach(() => {
    subscriptionService = new SubscriptionService();
    vi.clearAllMocks();
  });

  const mockSubscription = {
    id: 'sub-123',
    userId: 'user-123',
    stripeSubscriptionId: 'sub_stripe_123',
    stripePriceId: 'price_123',
    status: 'active' as const,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('getSubscription', () => {
    it('should return subscription when found', async () => {
      vi.mocked(subscriptionRepository.findById).mockResolvedValue(mockSubscription);

      const result = await subscriptionService.getSubscription('sub-123', 'user-123');

      expect(result.id).toBe('sub-123');
    });

    it('should throw error when subscription not found', async () => {
      vi.mocked(subscriptionRepository.findById).mockResolvedValue(null);

      await expect(
        subscriptionService.getSubscription('nonexistent', 'user-123')
      ).rejects.toThrow('Subscription not found');
    });

    it('should throw error when user does not own subscription', async () => {
      vi.mocked(subscriptionRepository.findById).mockResolvedValue({
        ...mockSubscription,
        userId: 'other-user',
      });

      await expect(
        subscriptionService.getSubscription('sub-123', 'user-123')
      ).rejects.toThrow('Access denied');
    });
  });

  describe('getSubscriptionsByUser', () => {
    it('should return user subscriptions', async () => {
      vi.mocked(subscriptionRepository.findByUserId).mockResolvedValue([mockSubscription]);

      const result = await subscriptionService.getSubscriptionsByUser('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sub-123');
    });
  });
});
