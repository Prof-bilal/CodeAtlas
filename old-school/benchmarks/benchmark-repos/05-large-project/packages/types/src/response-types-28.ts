export type ResponseStatus28 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type ResponsePriority28 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ResponseRecord28 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ResponseStatus28;
  priority: ResponsePriority28;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateResponsePayload28 {
  name: string;
  description?: string;
  status?: ResponseStatus28;
  priority?: ResponsePriority28;
  tags?: string[];
}
export interface UpdateResponsePayload28 {
  name?: string;
  description?: string;
  status?: ResponseStatus28;
  priority?: ResponsePriority28;
}
export interface ResponseListResponse28 {
  data: ResponseRecord28[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ResponseContext28 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}