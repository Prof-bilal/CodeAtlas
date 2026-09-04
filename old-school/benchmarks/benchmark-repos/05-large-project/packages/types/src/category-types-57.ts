export type CategoryStatus57 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type CategoryPriority57 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface CategoryRecord57 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: CategoryStatus57;
  priority: CategoryPriority57;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateCategoryPayload57 {
  name: string;
  description?: string;
  status?: CategoryStatus57;
  priority?: CategoryPriority57;
  tags?: string[];
}
export interface UpdateCategoryPayload57 {
  name?: string;
  description?: string;
  status?: CategoryStatus57;
  priority?: CategoryPriority57;
}
export interface CategoryListResponse57 {
  data: CategoryRecord57[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface CategoryContext57 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}