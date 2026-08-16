import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionRepository } from '../../src/database/repositories/subscriptionRepository.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('SubscriptionRepository', () => {
  let repo: SubscriptionRepository;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    repo = new SubscriptionRepository(mockEventBus);
  });

  describe('create', () => {
    it('should create subscription record', async () => {
      const sub = await repo.create({ userId: 'user-1', planId: 'pro', currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
      expect(sub.id).toBeDefined();
      expect(sub.status).toBe('active');
    });
  });

  describe('findByUser', () => {
    it('should find subscription by user', async () => {
      await repo.create({ userId: 'user-1', planId: 'pro', currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
      const sub = await repo.findByUser('user-1');
      expect(sub).toBeDefined();
    });
  });

  describe('getExpiringSoon', () => {
    it('should find expiring subscriptions', async () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      await repo.create({ userId: 'user-1', planId: 'pro', currentPeriodStart: new Date(), currentPeriodEnd: futureDate });
      const expiring = await repo.getExpiringSoon(7);
      expect(expiring).toHaveLength(1);
    });
  });
});
