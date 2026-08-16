export type ProductStatus56 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type ProductPriority56 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ProductRecord56 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ProductStatus56;
  priority: ProductPriority56;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateProductPayload56 {
  name: string;
  description?: string;
  status?: ProductStatus56;
  priority?: ProductPriority56;
  tags?: string[];
}
export interface UpdateProductPayload56 {
  name?: string;
  description?: string;
  status?: ProductStatus56;
  priority?: ProductPriority56;
}
export interface ProductListResponse56 {
  data: ProductRecord56[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ProductContext56 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}