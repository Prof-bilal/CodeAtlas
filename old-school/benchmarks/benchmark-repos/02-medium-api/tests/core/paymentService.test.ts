import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from '../../src/core/payments/paymentService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');
vi.mock('../../src/config/stripe.js', () => ({
  getStripeClient: vi.fn(),
}));

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let mockEventBus: any;
  let mockStripe: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    paymentService = new PaymentService(mockEventBus);

    const { getStripeClient } = require('../../src/config/stripe.js');
    mockStripe = {
      paymentIntents: {
        create: vi.fn().mockResolvedValue({ id: 'pi_test_123', status: 'succeeded' }),
      },
    };
    getStripeClient.mockReturnValue(mockStripe);
  });

  describe('createPayment', () => {
    it('should create a new payment', async () => {
      const payment = await paymentService.createPayment({ userId: 'user-1', amount: 1000 });
      expect(payment.id).toBeDefined();
      expect(payment.amount).toBe(1000);
      expect(payment.status).toBe('pending');
    });

    it('should reject invalid payment data', async () => {
      await expect(paymentService.createPayment({ userId: '', amount: 1000 }))
        .rejects.toThrow('Invalid payment data');
      await expect(paymentService.createPayment({ userId: 'user-1', amount: -500 }))
        .rejects.toThrow('Invalid payment data');
      await expect(paymentService.createPayment({ userId: 'user-1', amount: 1.5 }))
        .rejects.toThrow('Invalid payment data');
    });

    it('should reject invalid currency', async () => {
      await expect(paymentService.createPayment({ userId: 'user-1', amount: 1000, currency: 'US' }))
        .rejects.toThrow('Invalid payment data');
      await expect(paymentService.createPayment({ userId: 'user-1', amount: 1000, currency: 'USDDD' }))
        .rejects.toThrow('Invalid payment data');
    });
  });

  describe('processPayment', () => {
    it('should process pending payment via Stripe', async () => {
      const payment = await paymentService.createPayment({ userId: 'user-1', amount: 1000 });
      const processed = await paymentService.processPayment(payment.id);
      expect(processed.status).toBe('completed');
      expect(processed.stripePaymentIntentId).toBe('pi_test_123');
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 100000,
        currency: 'usd',
        payment_method: undefined,
        confirm: true,
      });
      expect(mockEventBus.emit).toHaveBeenCalledWith('payment:completed', expect.any(Object));
    });

    it('should handle Stripe failure and set status to failed', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(new Error('Card declined'));
      const payment = await paymentService.createPayment({ userId: 'user-1', amount: 1000 });
      await expect(paymentService.processPayment(payment.id)).rejects.toThrow('Card declined');
      expect(payment.status).toBe('failed');
      expect(mockEventBus.emit).toHaveBeenCalledWith('payment:failed', expect.objectContaining({
        error: expect.objectContaining({ message: 'Card declined' }),
      }));
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
