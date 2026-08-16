import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from '../../src/core/payments/paymentService.js';
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
    it('should create a new payment', async () => {
      const payment = await paymentService.createPayment({ userId: 'user-1', amount: 1000 });
      expect(payment.id).toBeDefined();
      expect(payment.amount).toBe(1000);
      expect(payment.status).toBe('pending');
    });
  });

  describe('processPayment', () => {
    it('should process pending payment', async () => {
      const payment = await paymentService.createPayment({ userId: 'user-1', amount: 1000 });
      const processed = await paymentService.processPayment(payment.id);
      expect(processed.status).toBe('completed');
    });

    it('should reject non-pending payment', async () => {
      const payment = await paymentService.createPayment({ userId: 'user-1', amount: 1000 });
      await paymentService.processPayment(payment.id);
      await expect(paymentService.processPayment(payment.id)).rejects.toThrow('Payment is not pending');
    });
  });

  describe('refundPayment', () => {
    it('should refund completed payment', async () => {
      const payment = await paymentService.createPayment({ userId: 'user-1', amount: 1000 });
      await paymentService.processPayment(payment.id);
      const refunded = await paymentService.refundPayment(payment.id, 500, 'Customer request');
      expect(refunded.status).toBe('refunded');
      expect(refunded.refundAmount).toBe(500);
    });

    it('should reject non-completed payment refund', async () => {
      const payment = await paymentService.createPayment({ userId: 'user-1', amount: 1000 });
      await expect(paymentService.refundPayment(payment.id)).rejects.toThrow('Payment is not completed');
    });
  });

  describe('getTotalByUser', () => {
    it('should calculate total for user', async () => {
      const p1 = await paymentService.createPayment({ userId: 'user-1', amount: 500 });
      const p2 = await paymentService.createPayment({ userId: 'user-1', amount: 300 });
      await paymentService.processPayment(p1.id);
      await paymentService.processPayment(p2.id);

      const total = await paymentService.getTotalByUser('user-1');
      expect(total).toBe(800);
    });
  });

  describe('getPaymentStats', () => {
    it('should return stats', async () => {
      const p1 = await paymentService.createPayment({ userId: 'user-1', amount: 1000 });
      const p2 = await paymentService.createPayment({ userId: 'user-2', amount: 2000 });
      await paymentService.processPayment(p1.id);
      await paymentService.processPayment(p2.id);

      const stats = await paymentService.getPaymentStats();
      expect(stats.totalPayments).toBe(2);
      expect(stats.totalRevenue).toBe(3000);
      expect(stats.averageAmount).toBe(1500);
    });
  });
});
