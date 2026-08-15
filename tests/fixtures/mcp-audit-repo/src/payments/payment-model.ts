import type { EntityId } from "../utils/id";

export interface PaymentRequest {
  userId: EntityId;
  amount: number;
  currency: "USD" | "EUR";
}

export interface PaymentReceipt {
  id: EntityId;
  approved: boolean;
  reason?: string;
}

export const DEFAULT_CURRENCY = "USD";
