export type LogStatus49 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type LogPriority49 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface LogRecord49 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: LogStatus49;
  priority: LogPriority49;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateLogPayload49 {
  name: string;
  description?: string;
  status?: LogStatus49;
  priority?: LogPriority49;
  tags?: string[];
}
export interface UpdateLogPayload49 {
  name?: string;
  description?: string;
  status?: LogStatus49;
  priority?: LogPriority49;
}
export interface LogListResponse49 {
  data: LogRecord49[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface LogContext49 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}