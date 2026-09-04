export type SurveyStatus9 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type SurveyPriority9 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface SurveyRecord9 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: SurveyStatus9;
  priority: SurveyPriority9;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateSurveyPayload9 {
  name: string;
  description?: string;
  status?: SurveyStatus9;
  priority?: SurveyPriority9;
  tags?: string[];
}
export interface UpdateSurveyPayload9 {
  name?: string;
  description?: string;
  status?: SurveyStatus9;
  priority?: SurveyPriority9;
}
export interface SurveyListResponse9 {
  data: SurveyRecord9[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface SurveyContext9 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}