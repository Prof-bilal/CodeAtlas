// Shared types - DUPLICATE
// See also types/ and common.ts

export interface SharedUser {
  id: string;
  name: string;
  email: string;
}

export interface SharedPayment {
  id: string;
  amount: number;
  currency: string;
}
