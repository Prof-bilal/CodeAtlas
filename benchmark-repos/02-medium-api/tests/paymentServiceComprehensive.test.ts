import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentServiceImpl } from '../src/services/paymentService.js';
import { PaymentRepository } from '../src/database/repositories/paymentRepository.js';
import { eventBus } from '../src/events/eventBus.js';

vi.mock('../src/database/repositories/paymentRepository.js');
vi.mock('../src/events/eventBus.js');
vi.mock('../src/config/stripe.js', () => ({
  getStripeClient: vi.fn(),
}));
vi.mock('../src/utils/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('PaymentServiceImpl', () => {
  let service: PaymentServiceImpl;
  let mockPaymentRepository: any;
  let mockStripe: any;

  beforeEach(() => {
    service = new PaymentServiceImpl();
    mockPaymentRepository = vi.mocked(PaymentRepository.prototype);
    vi.clearAllMocks();

    const { getStripeClient } = require('../src/config/stripe.js');
    mockStripe = {
      paymentIntents: {
        create: vi.fn().mockResolvedValue({ id: 'pi_test_123', status: 'succeeded' }),
      },
    };
    getStripeClient.mockReturnValue(mockStripe);
  });

  describe('getPayment', () => {
    it('should return payment if found', async () => {
      const mockPayment = { id: 'payment-1', amount: 1000 };
      mockPaymentRepository.findById.mockResolvedValue(mockPayment);

      const result = await service.getPayment('payment-1');
      expect(result).toEqual(mockPayment);
    });

    it('should throw error if payment not found', async () => {
      mockPaymentRepository.findById.mockResolvedValue(null);

      await expect(service.getPayment('payment-1')).rejects.toThrow('Payment not found');
    });
  });

  describe('createPayment', () => {
    it('should create payment successfully', async () => {
      const mockPayment = { id: 'payment-1', amount: 1000, userId: 'user-1' };
      mockPaymentRepository.create.mockResolvedValue(mockPayment);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.createPayment({
        userId: 'user-1',
        amount: 1000,
        currency: 'USD',
      });

      expect(result).toEqual(mockPayment);
      expect(mockPaymentRepository.create).toHaveBeenCalled();
    });
  });

  describe('processPayment', () => {
    it('should process pending payment via Stripe', async () => {
      const mockPayment = { id: 'payment-1', amount: 1000, userId: 'user-1', status: 'pending', currency: 'usd' };
      mockPaymentRepository.findById.mockResolvedValue(mockPayment);
      mockPaymentRepository.update.mockResolvedValue({ ...mockPayment, status: 'completed', stripePaymentId: 'pi_test_123' });
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.processPayment('payment-1');
      expect(result.status).toBe('completed');
      expect(result.stripePaymentId).toBe('pi_test_123');
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 100000,
        currency: 'usd',
        payment_method: undefined,
        confirm: true,
      });
      expect(mockPaymentRepository.update).toHaveBeenCalledWith('payment-1', {
        status: 'completed',
        stripePaymentId: 'pi_test_123',
      });
      expect(eventBus.publish).toHaveBeenCalledWith('payment.success', expect.objectContaining({
        stripePaymentIntentId: 'pi_test_123',
      }), 'payment-service');
    });

    it('should handle Stripe failure and set status to failed', async () => {
      const mockPayment = { id: 'payment-1', amount: 1000, userId: 'user-1', status: 'pending', currency: 'usd' };
      mockPaymentRepository.findById.mockResolvedValue(mockPayment);
      mockPaymentRepository.update.mockResolvedValue({ ...mockPayment, status: 'failed' });
      mockStripe.paymentIntents.create.mockRejectedValue(new Error('Card declined'));
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      await expect(service.processPayment('payment-1')).rejects.toThrow('Card declined');
      expect(mockPaymentRepository.update).toHaveBeenCalledWith('payment-1', { status: 'failed' });
      expect(eventBus.publish).toHaveBeenCalledWith('payment.failed', expect.objectContaining({
        paymentId: 'payment-1',
        error: 'Card declined',
      }), 'payment-service');
    });

    it('should throw error if payment not found', async () => {
      mockPaymentRepository.findById.mockResolvedValue(null);

      await expect(service.processPayment('payment-1')).rejects.toThrow('Payment not found');
    });

    it('should reject non-pending payment', async () => {
      const mockPayment = { id: 'payment-1', amount: 1000, userId: 'user-1', status: 'completed' };
      mockPaymentRepository.findById.mockResolvedValue(mockPayment);

      await expect(service.processPayment('payment-1')).rejects.toThrow('Payment is not in pending status');
    });

    it('should reject payment with non-positive amount', async () => {
      const mockPayment = { id: 'payment-1', amount: 0, userId: 'user-1', status: 'pending' };
      mockPaymentRepository.findById.mockResolvedValue(mockPayment);

      await expect(service.processPayment('payment-1')).rejects.toThrow('Payment amount must be positive');
    });
  });

  describe('refundPayment', () => {
    it('should refund payment successfully', async () => {
      const mockPayment = { id: 'payment-1', amount: 1000, userId: 'user-1' };
      mockPaymentRepository.findById.mockResolvedValue(mockPayment);
      mockPaymentRepository.updateStatus.mockResolvedValue({ ...mockPayment, status: 'refunded' });
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.refundPayment('payment-1');
      expect(result.status).toBe('refunded');
    });
  });

  describe('getPaymentsByUser', () => {
    it('should return payments for user', async () => {
      const mockPayments = [{ id: 'payment-1' }, { id: 'payment-2' }];
      mockPaymentRepository.findByUserId.mockResolvedValue(mockPayments);

      const result = await service.getPaymentsByUser('user-1');
      expect(result).toEqual(mockPayments);
    });
  });

  describe('getTotalByUser', () => {
    it('should return total for user', async () => {
      mockPaymentRepository.sumByUserId.mockResolvedValue(5000);

      const result = await service.getTotalByUser('user-1');
      expect(result).toBe(5000);
    });
  });
});
