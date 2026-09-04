export type InvoiceStatus0 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type InvoicePriority0 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface InvoiceRecord0 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: InvoiceStatus0;
  priority: InvoicePriority0;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateInvoicePayload0 {
  name: string;
  description?: string;
  status?: InvoiceStatus0;
  priority?: InvoicePriority0;
  tags?: string[];
}
export interface UpdateInvoicePayload0 {
  name?: string;
  description?: string;
  status?: InvoiceStatus0;
  priority?: InvoicePriority0;
}
export interface InvoiceListResponse0 {
  data: InvoiceRecord0[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface InvoiceContext0 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}