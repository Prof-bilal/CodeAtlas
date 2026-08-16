import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentRepository } from '../../src/database/repositories/paymentRepository.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('PaymentRepository', () => {
  let repo: PaymentRepository;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    repo = new PaymentRepository(mockEventBus);
  });

  describe('create', () => {
    it('should create payment record', async () => {
      const payment = await repo.create({ userId: 'user-1', amount: 1000, currency: 'usd' });
      expect(payment.id).toBeDefined();
      expect(payment.amount).toBe(1000);
    });
  });

  describe('findByUser', () => {
    it('should find payments by user', async () => {
      await repo.create({ userId: 'user-1', amount: 500, currency: 'usd' });
      await repo.create({ userId: 'user-2', amount: 300, currency: 'usd' });

      const payments = await repo.findByUser('user-1');
      expect(payments).toHaveLength(1);
    });
  });

  describe('getTotalByUser', () => {
    it('should calculate total', async () => {
      const p1 = await repo.create({ userId: 'user-1', amount: 500, currency: 'usd', status: 'completed' });
      const p2 = await repo.create({ userId: 'user-1', amount: 300, currency: 'usd', status: 'completed' });

      const total = await repo.getTotalByUser('user-1');
      expect(total).toBe(800);
    });
  });
});
