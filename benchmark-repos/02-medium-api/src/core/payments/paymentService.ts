import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { EventBus } from '../../events/eventBus.js';
import { cacheService } from '../../services/cacheService.js';
import Stripe from 'stripe';

export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentMethod?: string;
  stripePaymentIntentId?: string;
  refundId?: string;
  refundAmount?: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentDTO {
  userId: string;
  amount: number;
  currency?: string;
  paymentMethod?: string;
}

export interface Refund {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
}

export class PaymentService {
  private payments: Payment[] = [];
  private refunds: Refund[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async createPayment(data: CreatePaymentDTO): Promise<Payment> {
    const payment: Payment = {
      id: uuidv4(),
      userId: data.userId,
      amount: data.amount,
      currency: data.currency || 'usd',
      status: 'pending',
      paymentMethod: data.paymentMethod,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.payments.push(payment);
    await cacheService.invalidate(`payments:${data.userId}`);
    this.eventBus.emit('payment:created', { payment });

    return payment;
  }

  async processPayment(id: string): Promise<Payment> {
    const payment = await this.getPayment(id);
    if (payment.status !== 'pending') {
      throw new Error('Payment is not pending');
    }

    try {
      payment.status = 'completed';
      payment.updatedAt = new Date();
      this.eventBus.emit('payment:completed', { payment });
      return payment;
    } catch (error) {
      payment.status = 'failed';
      payment.updatedAt = new Date();
      this.eventBus.emit('payment:failed', { payment, error });
      throw error;
    }
  }

  async refundPayment(id: string, amount?: number, reason?: string): Promise<Payment> {
    const payment = await this.getPayment(id);
    if (payment.status !== 'completed') {
      throw new Error('Payment is not completed');
    }

    const refund: Refund = {
      id: uuidv4(),
      paymentId: id,
      amount: amount || payment.amount,
      reason: reason || 'Customer request',
      status: 'completed',
      createdAt: new Date(),
    };

    this.refunds.push(refund);
    payment.status = 'refunded';
    payment.refundId = refund.id;
    payment.refundAmount = refund.amount;
    payment.updatedAt = new Date();

    this.eventBus.emit('payment:refunded', { payment, refund });
    return payment;
  }

  async getPayment(id: string): Promise<Payment> {
    const payment = this.payments.find(p => p.id === id);
    if (!payment) {
      throw new Error('Payment not found');
    }
    return payment;
  }

  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    return this.payments.filter(p => p.userId === userId);
  }

  async getTotalByUser(userId: string): Promise<number> {
    return this.payments
      .filter(p => p.userId === userId && p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);
  }

  async getPaymentStats(): Promise<{ totalPayments: number; totalRevenue: number; averageAmount: number }> {
    const completedPayments = this.payments.filter(p => p.status === 'completed');
    return {
      totalPayments: completedPayments.length,
      totalRevenue: completedPayments.reduce((sum, p) => sum + p.amount, 0),
      averageAmount: completedPayments.length > 0
        ? completedPayments.reduce((sum, p) => sum + p.amount, 0) / completedPayments.length
        : 0,
    };
  }

  async getPaymentRefunds(paymentId: string): Promise<Refund[]> {
    return this.refunds.filter(r => r.paymentId === paymentId);
  }
}

export const paymentService = new PaymentService(new EventBus());
