export type TemplateStatus52 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type TemplatePriority52 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface TemplateRecord52 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: TemplateStatus52;
  priority: TemplatePriority52;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateTemplatePayload52 {
  name: string;
  description?: string;
  status?: TemplateStatus52;
  priority?: TemplatePriority52;
  tags?: string[];
}
export interface UpdateTemplatePayload52 {
  name?: string;
  description?: string;
  status?: TemplateStatus52;
  priority?: TemplatePriority52;
}
export interface TemplateListResponse52 {
  data: TemplateRecord52[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface TemplateContext52 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}