// Payment model
// DUPLICATE - see also payments.ts types

export interface PaymentModel {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  stripe_id: string | null;
  created_at: Date;
}

export function validatePayment(data: any): boolean {
  return data.amount > 0 && data.currency && data.user_id;
}
