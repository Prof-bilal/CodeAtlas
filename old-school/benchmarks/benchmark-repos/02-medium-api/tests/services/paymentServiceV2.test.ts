import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from '../../src/core/payments/paymentService.js';
import { PaymentRepository } from '../../src/database/repositories/paymentRepository.js';
import { StripeService } from '../../src/core/payments/stripeService.js';
import { EventBus } from '../../src/events/eventBus.js';
import { cacheService } from '../../src/services/cacheService.js';

vi.mock('../../src/database/repositories/paymentRepository.js');
vi.mock('../../src/core/payments/stripeService.js');
vi.mock('../../src/events/eventBus.js');
vi.mock('../../src/services/cacheService.js');

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let mockPaymentRepository: any;
  let mockStripeService: any;
  let mockEventBus: any;
  let mockCacheService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPaymentRepository = {
      findByUser: vi.fn(),
      getTotalByUser: vi.fn(),
      getStats: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    mockStripeService = {
      createPaymentIntent: vi.fn(),
      createRefund: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
    };
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    paymentService = new PaymentService(
      mockPaymentRepository,
      mockStripeService,
      mockEventBus,
      mockCacheService
    );
  });

  describe('processPayment', () => {
    it('should process payment via Stripe', async () => {
      const paymentId = 'payment-123';
      const mockPayment = { id: paymentId, amount: 1000, currency: 'usd', status: 'pending' };
      const mockStripeResult = { id: 'pi_123', status: 'succeeded' };
      
      mockPaymentRepository.findById.mockResolvedValue(mockPayment);
      mockStripeService.createPaymentIntent.mockResolvedValue(mockStripeResult);
      mockPaymentRepository.update.mockResolvedValue({ ...mockPayment, status: 'completed' });

      const result = await paymentService.processPayment(paymentId);

      expect(mockStripeService.createPaymentIntent).toHaveBeenCalledWith(1000, 'usd');
      expect(mockEventBus.emit).toHaveBeenCalledWith('payment:completed', expect.any(Object));
    });

    it('should emit failure event on Stripe error', async () => {
      const paymentId = 'payment-123';
      const mockPayment = { id: paymentId, amount: 1000, currency: 'usd', status: 'pending' };
      
      mockPaymentRepository.findById.mockResolvedValue(mockPayment);
      mockStripeService.createPaymentIntent.mockRejectedValue(new Error('Stripe error'));

      await expect(paymentService.processPayment(paymentId)).rejects.toThrow('Stripe error');
      expect(mockEventBus.emit).toHaveBeenCalledWith('payment:failed', expect.any(Object));
    });
  });

  describe('refundPayment', () => {
    it('should create refund via Stripe', async () => {
      const paymentId = 'payment-123';
      const amount = 500;
      const mockPayment = { id: paymentId, amount: 1000, currency: 'usd', status: 'completed' };
      const mockRefund = { id: 'refund_123', amount: 500, status: 'succeeded' };
      
      mockPaymentRepository.findById.mockResolvedValue(mockPayment);
      mockStripeService.createRefund.mockResolvedValue(mockRefund);

      const result = await paymentService.refundPayment(paymentId, amount, 'Customer request');

      expect(mockStripeService.createRefund).toHaveBeenCalledWith(paymentId, amount, 'Customer request');
      expect(mockEventBus.emit).toHaveBeenCalledWith('payment:refunded', expect.any(Object));
    });
  });
});
