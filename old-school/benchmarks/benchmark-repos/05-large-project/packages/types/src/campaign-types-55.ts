export type CampaignStatus55 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type CampaignPriority55 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface CampaignRecord55 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: CampaignStatus55;
  priority: CampaignPriority55;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateCampaignPayload55 {
  name: string;
  description?: string;
  status?: CampaignStatus55;
  priority?: CampaignPriority55;
  tags?: string[];
}
export interface UpdateCampaignPayload55 {
  name?: string;
  description?: string;
  status?: CampaignStatus55;
  priority?: CampaignPriority55;
}
export interface CampaignListResponse55 {
  data: CampaignRecord55[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface CampaignContext55 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}