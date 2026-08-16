import { ChargeProcessor, ChargeRequest, ChargeResult } from './processors/chargeProcessor.js';
import { RefundProcessor, RefundRequest, RefundResult } from './processors/refundProcessor.js';
import { SubscriptionProcessor, Subscription, SubscriptionPlan } from './processors/subscriptionProcessor.js';
import { AmountValidator } from './validators/amountValidator.js';
import { CurrencyValidator } from './validators/currencyValidator.js';

export interface PaymentServiceConfig {
  stripe?: { secretKey: string; webhookSecret: string };
  paypal?: { clientId: string; clientSecret: string; mode: 'sandbox' | 'live' };
}

export interface CreatePaymentRequest {
  userId: string;
  amount: number;
  currency: string;
  provider: string;
  description: string;
  metadata?: Record<string, string>;
  paymentMethodId?: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId: string;
  status: string;
  transactionId?: string;
  error?: string;
}

export class PaymentService {
  private chargeProcessor: ChargeProcessor;
  private refundProcessor: RefundProcessor;
  private subscriptionProcessor: SubscriptionProcessor;
  private amountValidator: AmountValidator;
  private currencyValidator: CurrencyValidator;
  private payments: Map<string, CreatePaymentRequest & { id: string; status: string; createdAt: Date }> = new Map();

  constructor(config: PaymentServiceConfig = {}) {
    this.chargeProcessor = new ChargeProcessor();
    this.refundProcessor = new RefundProcessor();
    this.subscriptionProcessor = new SubscriptionProcessor();
    this.amountValidator = new AmountValidator();
    this.currencyValidator = new CurrencyValidator();
  }

  async createPayment(request: CreatePaymentRequest): Promise<PaymentResult> {
    const amountValidation = this.amountValidator.validateCurrency(request.amount, request.currency);
    if (!amountValidation.valid) {
      return {
        success: false,
        paymentId: '',
        status: 'failed',
        error: amountValidation.errors.join(', '),
      };
    }
    const currencyValidation = this.currencyValidator.validate(request.currency);
    if (!currencyValidation.valid) {
      return {
        success: false,
        paymentId: '',
        status: 'failed',
        error: currencyValidation.errors.join(', '),
      };
    }
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.payments.set(paymentId, {
      ...request,
      id: paymentId,
      status: 'pending',
      createdAt: new Date(),
    });
    const chargeRequest: ChargeRequest = {
      paymentId,
      amount: request.amount,
      currency: request.currency,
      provider: request.provider,
      paymentMethodId: request.paymentMethodId || 'pm_default',
      metadata: request.metadata,
    };
    const chargeResult = await this.chargeProcessor.processCharge(chargeRequest);
    if (chargeResult.success) {
      const payment = this.payments.get(paymentId)!;
      payment.status = 'completed';
      return {
        success: true,
        paymentId,
        status: 'completed',
        transactionId: chargeResult.transactionId,
      };
    } else {
      const payment = this.payments.get(paymentId)!;
      payment.status = 'failed';
      return {
        success: false,
        paymentId,
        status: 'failed',
        error: chargeResult.error,
      };
    }
  }

  async refundPayment(paymentId: string, amount: number, reason: string): Promise<RefundResult> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      return { success: false, status: 'failed', error: 'Payment not found' };
    }
    if (payment.status !== 'completed') {
      return { success: false, status: 'failed', error: 'Payment is not completed' };
    }
    return this.refundProcessor.processRefund({
      paymentId,
      amount,
      reason,
      provider: payment.provider,
    });
  }

  async createSubscription(userId: string, planId: string, paymentMethodId: string, trialDays?: number): Promise<Subscription> {
    return this.subscriptionProcessor.createSubscription({
      userId,
      planId,
      paymentMethodId,
      trialDays,
    });
  }

  async cancelSubscription(subscriptionId: string, immediate: boolean = false): Promise<Subscription> {
    return this.subscriptionProcessor.cancelSubscription(subscriptionId, immediate);
  }

  getPayment(paymentId: string) {
    return this.payments.get(paymentId);
  }

  getUserPayments(userId: string) {
    return Array.from(this.payments.values()).filter(p => p.userId === userId);
  }

  getSubscription(subscriptionId: string): Subscription | undefined {
    return this.subscriptionProcessor.getSubscription(subscriptionId);
  }

  getUserSubscription(userId: string): Subscription | undefined {
    return this.subscriptionProcessor.getUserSubscription(userId);
  }

  getPlans(): SubscriptionPlan[] {
    return this.subscriptionProcessor.getAllPlans();
  }

  getStats() {
    const payments = Array.from(this.payments.values());
    return {
      totalPayments: payments.length,
      completedPayments: payments.filter(p => p.status === 'completed').length,
      failedPayments: payments.filter(p => p.status === 'failed').length,
      chargeStats: this.chargeProcessor.getStats(),
      refundStats: this.refundProcessor.getStats(),
      activeSubscriptions: this.subscriptionProcessor.getActiveSubscriptions().length,
    };
  }
}
