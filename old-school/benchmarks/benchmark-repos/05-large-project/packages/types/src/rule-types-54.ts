export type RuleStatus54 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type RulePriority54 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface RuleRecord54 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: RuleStatus54;
  priority: RulePriority54;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateRulePayload54 {
  name: string;
  description?: string;
  status?: RuleStatus54;
  priority?: RulePriority54;
  tags?: string[];
}
export interface UpdateRulePayload54 {
  name?: string;
  description?: string;
  status?: RuleStatus54;
  priority?: RulePriority54;
}
export interface RuleListResponse54 {
  data: RuleRecord54[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface RuleContext54 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}