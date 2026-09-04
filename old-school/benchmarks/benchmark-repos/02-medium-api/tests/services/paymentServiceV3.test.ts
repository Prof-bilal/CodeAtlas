import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from '../../src/services/paymentService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    paymentService = new PaymentService(mockEventBus);
  });

  describe('createPayment', () => {
    it('should create payment', async () => {
      const payment = await paymentService.createPayment({ userId: 'user-1', amount: 1000 });
      expect(payment.id).toBeDefined();
      expect(payment.amount).toBe(1000);
    });
  });

  describe('getTotalByUser', () => {
    it('should calculate total', async () => {
      const total = await paymentService.getTotalByUser('user-1');
      expect(total).toBe(0);
    });
  });
});
