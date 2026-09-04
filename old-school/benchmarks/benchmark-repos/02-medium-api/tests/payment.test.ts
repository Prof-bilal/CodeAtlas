import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from '../src/services/paymentService.js';
import { paymentRepository } from '../src/repositories/paymentRepository.js';
import { userRepository } from '../src/repositories/userRepository.js';
import { getStripeClient } from '../src/config/stripe.js';
import { AppError } from '../src/services/authService.js';

vi.mock('../src/repositories/paymentRepository.js');
vi.mock('../src/repositories/userRepository.js');
vi.mock('../src/config/stripe.js');

describe('PaymentService', () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    paymentService = new PaymentService();
    vi.clearAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'John',
    lastName: 'Doe',
    role: 'user' as const,
    isActive: true,
    emailVerified: true,
    stripeCustomerId: 'cus_123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPayment = {
    id: 'payment-123',
    userId: 'user-123',
    stripePaymentIntentId: 'pi_123',
    stripeInvoiceId: null,
    amount: 1000,
    currency: 'usd',
    status: 'succeeded' as const,
    description: 'Test payment',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('getPaymentsByUser', () => {
    it('should return paginated payments', async () => {
      vi.mocked(paymentRepository.findByUserId).mockResolvedValue([mockPayment]);
      vi.mocked(paymentRepository.countByUserId).mockResolvedValue(1);

      const result = await paymentService.getPaymentsByUser('user-123', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('getPaymentById', () => {
    it('should return payment when found', async () => {
      vi.mocked(paymentRepository.findById).mockResolvedValue(mockPayment);

      const result = await paymentService.getPaymentById('payment-123', 'user-123');

      expect(result.id).toBe('payment-123');
    });

    it('should throw error when payment not found', async () => {
      vi.mocked(paymentRepository.findById).mockResolvedValue(null);

      await expect(
        paymentService.getPaymentById('nonexistent', 'user-123')
      ).rejects.toThrow('Payment not found');
    });

    it('should throw error when user does not own payment', async () => {
      vi.mocked(paymentRepository.findById).mockResolvedValue({
        ...mockPayment,
        userId: 'other-user',
      });

      await expect(
        paymentService.getPaymentById('payment-123', 'user-123')
      ).rejects.toThrow('Access denied');
    });
  });
});
