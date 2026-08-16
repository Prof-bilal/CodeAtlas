export type TicketStatus47 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type TicketPriority47 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface TicketRecord47 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: TicketStatus47;
  priority: TicketPriority47;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateTicketPayload47 {
  name: string;
  description?: string;
  status?: TicketStatus47;
  priority?: TicketPriority47;
  tags?: string[];
}
export interface UpdateTicketPayload47 {
  name?: string;
  description?: string;
  status?: TicketStatus47;
  priority?: TicketPriority47;
}
export interface TicketListResponse47 {
  data: TicketRecord47[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface TicketContext47 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}