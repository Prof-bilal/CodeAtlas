import { PaymentRepository } from '../database/repositories/paymentRepository.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';

export interface PaymentService {
  getPayment(id: string): Promise<any>;
  createPayment(data: any): Promise<any>;
  processPayment(id: string): Promise<any>;
  refundPayment(id: string, amount?: number): Promise<any>;
  getPaymentsByUser(userId: string): Promise<any[]>;
  getTotalByUser(userId: string): Promise<number>;
}

export class PaymentServiceImpl implements PaymentService {
  private paymentRepository: PaymentRepository;

  constructor() {
    this.paymentRepository = new PaymentRepository();
  }

  async getPayment(id: string): Promise<any> {
    const payment = await this.paymentRepository.findById(id);
    if (!payment) {
      throw new Error('Payment not found');
    }
    return payment;
  }

  async createPayment(data: any): Promise<any> {
    const payment = await this.paymentRepository.create(data);

    await eventBus.publish('payment.created', {
      paymentId: payment.id,
      userId: data.userId,
      amount: data.amount,
      currency: data.currency,
    }, 'payment-service');

    return payment;
  }

  async processPayment(id: string): Promise<any> {
    const payment = await this.paymentRepository.findById(id);
    if (!payment) {
      throw new Error('Payment not found');
    }

    // Simulate payment processing
    const updatedPayment = await this.paymentRepository.updateStatus(id, 'completed');

    await eventBus.publish('payment.success', {
      paymentId: id,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency,
    }, 'payment-service');

    return updatedPayment;
  }

  async refundPayment(id: string, amount?: number): Promise<any> {
    const payment = await this.paymentRepository.findById(id);
    if (!payment) {
      throw new Error('Payment not found');
    }

    const updatedPayment = await this.paymentRepository.updateStatus(id, 'refunded');

    await eventBus.publish('payment.refunded', {
      paymentId: id,
      userId: payment.userId,
      amount: amount || payment.amount,
      reason: 'User requested refund',
    }, 'payment-service');

    return updatedPayment;
  }

  async getPaymentsByUser(userId: string): Promise<any[]> {
    return this.paymentRepository.findByUserId(userId);
  }

  async getTotalByUser(userId: string): Promise<number> {
    return this.paymentRepository.sumByUserId(userId, 'completed');
  }
}

export const paymentService = new PaymentServiceImpl();
