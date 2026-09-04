// Invoice model
// Old billing system

export interface Invoice {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  lineItems: InvoiceLineItem[];
  dueDate: Date;
  paidAt: Date | null;
}

export interface InvoiceLineItem {
  description: string;
  amount: number;
  quantity: number;
}
