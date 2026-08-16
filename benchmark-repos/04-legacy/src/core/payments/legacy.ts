// Legacy payment module - DO NOT MODIFY
// Copied from payments.ts for the legacy billing system
// This version uses direct SQL queries instead of repositories

import { createHmac } from 'crypto';

interface LegacyPayment {
  id: number;
  customer_id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  created: string;
}

// In-memory store for legacy system
const legacyPayments: LegacyPayment[] = [];
let nextId = 1;

export function createLegacyPayment(
  customerId: string,
  amount: number,
  currency: string,
  description: string
): LegacyPayment {
  const payment: LegacyPayment = {
    id: nextId++,
    customer_id: customerId,
    amount,
    currency,
    description,
    status: 'pending',
    created: new Date().toISOString(),
  };

  legacyPayments.push(payment);
  return payment;
}

export function completeLegacyPayment(id: number): boolean {
  const payment = legacyPayments.find(p => p.id === id);
  if (!payment) return false;
  payment.status = 'completed';
  return true;
}

export function getLegacyPayment(id: number): LegacyPayment | undefined {
  return legacyPayments.find(p => p.id === id);
}

export function getLegacyPaymentsByCustomer(customerId: string): LegacyPayment[] {
  return legacyPayments.filter(p => p.customer_id === customerId);
}

export function generateLegacySignature(data: string): string {
  return createHmac('sha256', 'legacy-signing-key')
    .update(data)
    .digest('hex');
}

// Used by legacy webhook handler
export function verifyLegacyWebhook(
  payload: string,
  signature: string
): boolean {
  const expected = generateLegacySignature(payload);
  return signature === expected;
}
