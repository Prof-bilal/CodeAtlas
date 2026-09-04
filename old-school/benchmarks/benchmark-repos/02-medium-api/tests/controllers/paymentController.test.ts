import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentController } from '../../src/controllers/paymentControllerV2.js';
import { PaymentService } from '../../src/core/payments/paymentService.js';

vi.mock('../../src/core/payments/paymentService.js');

describe('PaymentController', () => {
  let paymentController: PaymentController;
  let mockPaymentService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPaymentService = {
      getPaymentsByUser: vi.fn(),
      getPayment: vi.fn(),
      createPayment: vi.fn(),
      processPayment: vi.fn(),
      refundPayment: vi.fn(),
      getTotalByUser: vi.fn(),
      getPaymentStats: vi.fn(),
    };
    vi.mocked(PaymentService).mockImplementation(() => mockPaymentService);
    paymentController = new PaymentController();
    mockReq = { body: {}, params: {}, user: { id: 'user-1' } } as any;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
  });

  describe('getPayments', () => {
    it('should return payments', async () => {
      mockPaymentService.getPaymentsByUser.mockResolvedValue([]);
      await paymentController.getPayments(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });
  });

  describe('createPayment', () => {
    it('should create payment', async () => {
      mockReq.body = { amount: 1000 };
      mockPaymentService.createPayment.mockResolvedValue({ id: 'p1', amount: 1000 });
      await paymentController.createPayment(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });
});
