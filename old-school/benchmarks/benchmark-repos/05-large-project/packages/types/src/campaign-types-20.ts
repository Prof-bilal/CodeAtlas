export type CampaignStatus20 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type CampaignPriority20 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface CampaignRecord20 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: CampaignStatus20;
  priority: CampaignPriority20;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateCampaignPayload20 {
  name: string;
  description?: string;
  status?: CampaignStatus20;
  priority?: CampaignPriority20;
  tags?: string[];
}
export interface UpdateCampaignPayload20 {
  name?: string;
  description?: string;
  status?: CampaignStatus20;
  priority?: CampaignPriority20;
}
export interface CampaignListResponse20 {
  data: CampaignRecord20[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface CampaignContext20 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}