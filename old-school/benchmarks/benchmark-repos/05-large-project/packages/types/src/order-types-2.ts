export type OrderStatus2 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type OrderPriority2 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface OrderRecord2 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: OrderStatus2;
  priority: OrderPriority2;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateOrderPayload2 {
  name: string;
  description?: string;
  status?: OrderStatus2;
  priority?: OrderPriority2;
  tags?: string[];
}
export interface UpdateOrderPayload2 {
  name?: string;
  description?: string;
  status?: OrderStatus2;
  priority?: OrderPriority2;
}
export interface OrderListResponse2 {
  data: OrderRecord2[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface OrderContext2 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}