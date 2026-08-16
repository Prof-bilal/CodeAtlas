// Billing service v2 - CURRENT

import { Database } from '../database/connection';
import { Redis } from '../integrations/redis';
import { Logger } from '../utils';
import { v4 as uuidv4 } from 'uuid';

export interface InvoiceV2 {
  id: string;
  userId: string;
  organizationId: string | null;
  amount: number;
  tax: number;
  total: number;
  currency: string;
  status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled';
  lineItems: LineItem[];
  billingPeriod: { start: Date; end: Date };
  paidAt: Date | null;
  dueDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  metadata?: Record<string, any>;
}

export interface BillingCycle {
  id: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  status: 'active' | 'completed' | 'pending';
}

export class BillingServiceV2 {
  private db: Database;
  private redis: Redis;

  constructor(db: Database, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  async createInvoice(input: {
    userId: string;
    organizationId?: string;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
    taxRate?: number;
  }): Promise<InvoiceV2> {
    const id = uuidv4();
    const lineItems: LineItem[] = input.lineItems.map(item => ({
      id: uuidv4(),
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.quantity * item.unitPrice,
    }));

    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = input.taxRate || 0.1;
    const tax = subtotal * taxRate;

    const invoice: InvoiceV2 = {
      id,
      userId: input.userId,
      organizationId: input.organizationId || null,
      amount: subtotal,
      tax,
      total: subtotal + tax,
      currency: 'usd',
      status: 'draft',
      lineItems,
      billingPeriod: {
        start: new Date(),
        end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      paidAt: null,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.db.query(
      INSERT INTO invoices (id, user_id, organization_id, amount, tax, total, currency, status, line_items, billing_period_start, billing_period_end, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
      [invoice.id, invoice.userId, invoice.organizationId, invoice.amount,
       invoice.tax, invoice.total, invoice.currency, invoice.status,
       JSON.stringify(invoice.lineItems), invoice.billingPeriod.start.toISOString(),
       invoice.billingPeriod.end.toISOString(), invoice.dueDate.toISOString(),
       invoice.createdAt.toISOString(), invoice.updatedAt.toISOString()]
    );

    Logger.info(Invoice created: );

    return invoice;
  }

  async sendInvoice(invoiceId: string): Promise<void> {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    await this.db.query(
      "UPDATE invoices SET status = 'pending', updated_at = ? WHERE id = ?",
      [new Date().toISOString(), invoiceId]
    );

    Logger.info(Invoice sent: );
  }

  async getInvoice(id: string): Promise<InvoiceV2 | null> {
    const results = await this.db.query(
      'SELECT * FROM invoices WHERE id = ?',
      [id]
    ) as any[];

    return results.length > 0 ? this.mapRow(results[0]) : null;
  }

  async getUserInvoices(userId: string): Promise<InvoiceV2[]> {
    const results = await this.db.query(
      'SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    ) as any[];

    return results.map(this.mapRow);
  }

  async getOverdueInvoices(): Promise<InvoiceV2[]> {
    const results = await this.db.query(
      "SELECT * FROM invoices WHERE status = 'pending' AND due_date < ?",
      [new Date().toISOString()]
    ) as any[];

    return results.map(this.mapRow);
  }

  async markAsPaid(invoiceId: string, paymentId: string): Promise<void> {
    await this.db.query(
      "UPDATE invoices SET status = 'paid', paid_at = ?, payment_id = ?, updated_at = ? WHERE id = ?",
      [new Date().toISOString(), paymentId, new Date().toISOString(), invoiceId]
    );
    Logger.info(Invoice paid: );
  }

  async cancelInvoice(invoiceId: string): Promise<void> {
    await this.db.query(
      "UPDATE invoices SET status = 'cancelled', updated_at = ? WHERE id = ?",
      [new Date().toISOString(), invoiceId]
    );
  }

  async generateBillingCycle(userId: string): Promise<BillingCycle> {
    const cycle: BillingCycle = {
      id: uuidv4(),
      userId,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'active',
    };

    return cycle;
  }

  private mapRow(row: any): InvoiceV2 {
    return {
      id: row.id,
      userId: row.user_id,
      organizationId: row.organization_id,
      amount: row.amount,
      tax: row.tax,
      total: row.total,
      currency: row.currency,
      status: row.status,
      lineItems: typeof row.line_items === 'string' ? JSON.parse(row.line_items) : row.line_items,
      billingPeriod: {
        start: new Date(row.billing_period_start),
        end: new Date(row.billing_period_end),
      },
      paidAt: row.paid_at ? new Date(row.paid_at) : null,
      dueDate: new Date(row.due_date),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
