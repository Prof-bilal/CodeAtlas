export type FieldStatus16 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type FieldPriority16 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface FieldRecord16 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: FieldStatus16;
  priority: FieldPriority16;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateFieldPayload16 {
  name: string;
  description?: string;
  status?: FieldStatus16;
  priority?: FieldPriority16;
  tags?: string[];
}
export interface UpdateFieldPayload16 {
  name?: string;
  description?: string;
  status?: FieldStatus16;
  priority?: FieldPriority16;
}
export interface FieldListResponse16 {
  data: FieldRecord16[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface FieldContext16 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}