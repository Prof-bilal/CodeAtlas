// Payment types - DUPLICATE
// See also common.ts and payments.ts

export interface PaymentType {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
