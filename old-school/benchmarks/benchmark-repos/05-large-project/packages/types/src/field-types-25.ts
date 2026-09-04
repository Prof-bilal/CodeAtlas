export type FieldStatus25 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type FieldPriority25 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface FieldRecord25 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: FieldStatus25;
  priority: FieldPriority25;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateFieldPayload25 {
  name: string;
  description?: string;
  status?: FieldStatus25;
  priority?: FieldPriority25;
  tags?: string[];
}
export interface UpdateFieldPayload25 {
  name?: string;
  description?: string;
  status?: FieldStatus25;
  priority?: FieldPriority25;
}
export interface FieldListResponse25 {
  data: FieldRecord25[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface FieldContext25 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}