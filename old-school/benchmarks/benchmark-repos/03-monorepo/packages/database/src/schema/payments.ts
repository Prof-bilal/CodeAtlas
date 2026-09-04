export const PAYMENTS_TABLE = `
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  type TEXT NOT NULL DEFAULT 'one_time',
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  description TEXT,
  order_id TEXT,
  invoice_id TEXT,
  subscription_id TEXT,
  plan_id TEXT,
  coupon_code TEXT,
  ip TEXT,
  user_agent TEXT,
  completed_at TEXT,
  failed_at TEXT,
  failure_reason TEXT,
  refund_id TEXT,
  refund_amount INTEGER,
  refund_reason TEXT,
  refund_status TEXT,
  refund_provider_id TEXT,
  refund_created_at TEXT,
  refund_completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
)`;

export const PAYMENTS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)',
  'CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type)',
  'CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider)',
  'CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider_payment_id)',
];

export interface PaymentRow {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  provider: string;
  provider_payment_id: string | null;
  description: string | null;
  order_id: string | null;
  invoice_id: string | null;
  subscription_id: string | null;
  plan_id: string | null;
  coupon_code: string | null;
  ip: string | null;
  user_agent: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  refund_id: string | null;
  refund_amount: number | null;
  refund_reason: string | null;
  refund_status: string | null;
  refund_provider_id: string | null;
  refund_created_at: string | null;
  refund_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function paymentRowToEntity(row: PaymentRow) {
  return {
    id: row.id,
    userId: row.user_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    type: row.type,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id || undefined,
    description: row.description || '',
    metadata: {
      orderId: row.order_id || undefined,
      invoiceId: row.invoice_id || undefined,
      subscriptionId: row.subscription_id || undefined,
      planId: row.plan_id || undefined,
      couponCode: row.coupon_code || undefined,
      ip: row.ip || undefined,
      userAgent: row.user_agent || undefined,
    },
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    failedAt: row.failed_at ? new Date(row.failed_at) : undefined,
    failureReason: row.failure_reason || undefined,
    refund: row.refund_id ? {
      id: row.refund_id,
      paymentId: row.id,
      amount: row.refund_amount || 0,
      reason: row.refund_reason || '',
      status: row.refund_status || 'pending',
      providerRefundId: row.refund_provider_id || undefined,
      createdAt: row.refund_created_at ? new Date(row.refund_created_at) : new Date(),
      completedAt: row.refund_completed_at ? new Date(row.refund_completed_at) : undefined,
    } : undefined,
  };
}

export function paymentEntityToRow(entity: Record<string, unknown>) {
  const metadata = entity.metadata as Record<string, unknown>;
  const refund = entity.refund as Record<string, unknown> | undefined;
  return {
    id: entity.id,
    user_id: entity.userId,
    amount: entity.amount,
    currency: entity.currency,
    status: entity.status,
    type: entity.type,
    provider: entity.provider,
    provider_payment_id: metadata?.providerPaymentId || null,
    description: entity.description || null,
    order_id: metadata?.orderId || null,
    invoice_id: metadata?.invoiceId || null,
    subscription_id: metadata?.subscriptionId || null,
    plan_id: metadata?.planId || null,
    coupon_code: metadata?.couponCode || null,
    ip: metadata?.ip || null,
    user_agent: metadata?.userAgent || null,
    completed_at: entity.completedAt ? new Date(entity.completedAt as string).toISOString() : null,
    failed_at: entity.failedAt ? new Date(entity.failedAt as string).toISOString() : null,
    failure_reason: entity.failureReason || null,
    refund_id: refund?.id || null,
    refund_amount: refund?.amount || null,
    refund_reason: refund?.reason || null,
    refund_status: refund?.status || null,
    refund_provider_id: refund?.providerRefundId || null,
    refund_created_at: refund?.createdAt ? new Date(refund.createdAt as string).toISOString() : null,
    refund_completed_at: refund?.completedAt ? new Date(refund.completedAt as string).toISOString() : null,
  };
}
