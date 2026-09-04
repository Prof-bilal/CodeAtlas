import { User } from './user.js';

export interface Payment {
  id: string;
  userId: string;
  user?: User;
  amount: number;
  currency: string;
  status: PaymentStatus;
  type: PaymentType;
  provider: PaymentProvider;
  providerPaymentId?: string;
  description: string;
  metadata: PaymentMetadata;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  refund?: Refund;
}

export interface PaymentMetadata {
  orderId?: string;
  invoiceId?: string;
  subscriptionId?: string;
  planId?: string;
  couponCode?: string;
  ip?: string;
  userAgent?: string;
}

export interface Refund {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  providerRefundId?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt?: Date;
  canceledAt?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  maxUsers: number;
  maxProjects: number;
  maxStorage: number;
  isActive: boolean;
}

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';
export type PaymentType = 'one_time' | 'subscription' | 'refund' | 'payout';
export type PaymentProvider = 'stripe' | 'paypal' | 'square';
export type RefundStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing' | 'paused';

export interface CreatePaymentRequest {
  userId: string;
  amount: number;
  currency: string;
  type: PaymentType;
  provider: PaymentProvider;
  description: string;
  metadata?: Partial<PaymentMetadata>;
  paymentMethodId?: string;
}

export interface CreateSubscriptionRequest {
  userId: string;
  planId: string;
  paymentMethodId: string;
  trialDays?: number;
}

export interface PaymentFilter {
  userId?: string;
  status?: PaymentStatus[];
  type?: PaymentType[];
  provider?: PaymentProvider[];
  amountMin?: number;
  amountMax?: number;
  currency?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export function formatCurrency(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
  return formatter.format(amount / 100);
}

export function isPaymentSuccessful(payment: Payment): boolean {
  return payment.status === 'completed';
}

export function canRefund(payment: Payment): boolean {
  if (payment.status !== 'completed') return false;
  if (payment.type === 'refund') return false;
  if (payment.refund) return false;
  const hoursSinceCompletion = payment.completedAt
    ? (Date.now() - new Date(payment.completedAt).getTime()) / (1000 * 60 * 60)
    : 0;
  return hoursSinceCompletion < 24 * 30;
}

export function getDaysUntilRenewal(subscription: Subscription): number {
  const now = new Date();
  const end = new Date(subscription.currentPeriodEnd);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}
