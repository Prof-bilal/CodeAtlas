import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionService, PLANS } from '../../src/core/subscriptions/subscriptionService.js';
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
    it('should create a new subscription', async () => {
      const sub = await subscriptionService.createSubscription({
        userId: 'user-1',
        planId: 'pro',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(sub.id).toBeDefined();
      expect(sub.planId).toBe('pro');
      expect(sub.status).toBe('active');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel active subscription', async () => {
      const sub = await subscriptionService.createSubscription({
        userId: 'user-1',
        planId: 'pro',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const canceled = await subscriptionService.cancelSubscription(sub.id);
      expect(canceled.status).toBe('canceled');
      expect(canceled.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('upgradeSubscription', () => {
    it('should upgrade plan', async () => {
      const sub = await subscriptionService.createSubscription({
        userId: 'user-1',
        planId: 'free',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const upgraded = await subscriptionService.upgradeSubscription(sub.id, 'enterprise');
      expect(upgraded.planId).toBe('enterprise');
    });
  });

  describe('getExpiringSoon', () => {
    it('should find expiring subscriptions', async () => {
      await subscriptionService.createSubscription({
        userId: 'user-1',
        planId: 'pro',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const expiring = await subscriptionService.getExpiringSoon(7);
      expect(expiring).toHaveLength(1);
    });
  });

  describe('getPlanById', () => {
    it('should return plan by id', async () => {
      const plan = await subscriptionService.getPlanById('pro');
      expect(plan).toBeDefined();
      expect(plan!.name).toBe('Pro');
      expect(plan!.price).toBe(999);
    });

    it('should return null for unknown plan', async () => {
      const plan = await subscriptionService.getPlanById('nonexistent');
      expect(plan).toBeNull();
    });
  });
});
