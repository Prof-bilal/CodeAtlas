export interface PaymentModel {
  id: string;
  userId: string;
  stripePaymentIntentId: string;
  stripeInvoiceId: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  description: string | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentInput {
  userId: string;
  amount: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  id: string;
  userId: string;
  stripePaymentIntentId: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  createdAt: Date;
}

export function toPaymentResponse(payment: PaymentModel): PaymentResponse {
  return {
    id: payment.id,
    userId: payment.userId,
    stripePaymentIntentId: payment.stripePaymentIntentId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    description: payment.description,
    createdAt: payment.createdAt,
  };
}
