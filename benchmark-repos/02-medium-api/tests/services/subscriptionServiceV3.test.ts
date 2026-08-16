import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionService } from '../../src/services/subscriptionService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    subscriptionService = new SubscriptionService(mockEventBus);
  });

  describe('createSubscription', () => {
    it('should create subscription', async () => {
      const sub = await subscriptionService.createSubscription({
        userId: 'user-1',
        planId: 'pro',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(sub.id).toBeDefined();
      expect(sub.status).toBe('active');
    });
  });
});
