export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled';
export type PaymentMethod = 'credit_card' | 'debit_card' | 'bank_transfer' | 'paypal' | 'stripe' | 'crypto';
export interface Payment { id: string; orderId: string; userId: string; amount: number; currency: string; status: PaymentStatus; method: PaymentMethod; provider: string; metadata: Record<string, unknown>; createdAt: Date; completedAt?: Date; }
export interface PaymentIntent { id: string; amount: number; currency: string; status: string; clientSecret: string; }
export interface Refund { id: string; paymentId: string; amount: number; reason: string; status: 'pending' | 'succeeded' | 'failed'; createdAt: Date; }
export interface Invoice { id: string; userId: string; number: string; status: 'draft' | 'sent' | 'paid' | 'overdue'; items: InvoiceItem[]; total: number; currency: string; dueDate: Date; }
export interface InvoiceItem { description: string; quantity: number; unitPrice: number; amount: number; }
export interface Subscription { id: string; userId: string; planId: string; status: 'active' | 'past_due' | 'canceled' | 'trialing'; currentPeriodStart: Date; currentPeriodEnd: Date; }