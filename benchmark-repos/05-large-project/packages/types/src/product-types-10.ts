export type ProductStatus10 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type ProductPriority10 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ProductRecord10 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ProductStatus10;
  priority: ProductPriority10;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateProductPayload10 {
  name: string;
  description?: string;
  status?: ProductStatus10;
  priority?: ProductPriority10;
  tags?: string[];
}
export interface UpdateProductPayload10 {
  name?: string;
  description?: string;
  status?: ProductStatus10;
  priority?: ProductPriority10;
}
export interface ProductListResponse10 {
  data: ProductRecord10[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ProductContext10 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}