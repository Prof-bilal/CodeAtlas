import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentServiceImpl } from '../src/services/paymentService.js';
import { PaymentRepository } from '../src/database/repositories/paymentRepository.js';
import { eventBus } from '../src/events/eventBus.js';

vi.mock('../src/database/repositories/paymentRepository.js');
vi.mock('../src/events/eventBus.js');

describe('PaymentServiceImpl', () => {
  let service: PaymentServiceImpl;
  let mockPaymentRepository: any;

  beforeEach(() => {
    service = new PaymentServiceImpl();
    mockPaymentRepository = vi.mocked(PaymentRepository.prototype);
    vi.clearAllMocks();
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
    it('should process payment successfully', async () => {
      const mockPayment = { id: 'payment-1', amount: 1000, userId: 'user-1', status: 'pending' };
      mockPaymentRepository.findById.mockResolvedValue(mockPayment);
      mockPaymentRepository.updateStatus.mockResolvedValue({ ...mockPayment, status: 'completed' });
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.processPayment('payment-1');
      expect(result.status).toBe('completed');
    });

    it('should throw error if payment not found', async () => {
      mockPaymentRepository.findById.mockResolvedValue(null);

      await expect(service.processPayment('payment-1')).rejects.toThrow('Payment not found');
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
