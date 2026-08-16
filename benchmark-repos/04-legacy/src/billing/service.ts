// Billing service - OLD
// DEPRECATED - use paymentServiceV2.ts

import { Database } from '../database/connection';
import { Logger } from '../utils';

interface Invoice {
  id: string;
  userId: string;
  amount: number;
  status: string;
  dueDate: Date;
}

export class BillingService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async createInvoice(userId: string, amount: number): Promise<Invoice> {
    const invoice: Invoice = {
      id: inv_,
      userId,
      amount,
      status: 'pending',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };

    Logger.info(Invoice created: );
    return invoice;
  }

  async getOverdueInvoices(): Promise<Invoice[]> {
    return [];
  }

  async markAsPaid(invoiceId: string): Promise<void> {
    Logger.info(Invoice paid: );
  }
}
