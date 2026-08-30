import { PaymentRepository } from '../database/repositories/paymentRepository.js';
import { eventBus } from '../events/eventBus.js';
import { logger } from '../utils/logger.js';
import { getStripeClient } from '../config/stripe.js';

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

    if (payment.status !== 'pending') {
      throw new Error('Payment is not in pending status');
    }

    if (!payment.amount || payment.amount <= 0) {
      throw new Error('Payment amount must be positive');
    }

    try {
      const stripe = getStripeClient();
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(payment.amount * 100),
        currency: payment.currency || 'usd',
        payment_method: payment.paymentMethod,
        confirm: true,
      });

      const updatedPayment = await this.paymentRepository.update(id, {
        status: 'completed',
        stripePaymentId: paymentIntent.id,
      });

      await eventBus.publish('payment.success', {
        paymentId: id,
        userId: payment.userId,
        amount: payment.amount,
        currency: payment.currency,
        stripePaymentIntentId: paymentIntent.id,
      }, 'payment-service');

      return updatedPayment;
    } catch (error) {
      logger.error('Payment processing failed', { paymentId: id, error });

      await this.paymentRepository.update(id, { status: 'failed' });

      await eventBus.publish('payment.failed', {
        paymentId: id,
        userId: payment.userId,
        amount: payment.amount,
        currency: payment.currency,
        error: error instanceof Error ? error.message : String(error),
      }, 'payment-service');

      throw error;
    }
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
