export type ChannelStatus37 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type ChannelPriority37 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface ChannelRecord37 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: ChannelStatus37;
  priority: ChannelPriority37;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateChannelPayload37 {
  name: string;
  description?: string;
  status?: ChannelStatus37;
  priority?: ChannelPriority37;
  tags?: string[];
}
export interface UpdateChannelPayload37 {
  name?: string;
  description?: string;
  status?: ChannelStatus37;
  priority?: ChannelPriority37;
}
export interface ChannelListResponse37 {
  data: ChannelRecord37[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ChannelContext37 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}