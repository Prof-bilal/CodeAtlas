import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { cacheService } from '../../services/cacheService.js';
import { EventBus } from '../../events/eventBus.js';

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}

export interface AuditQuery {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditService {
  private auditLogs: AuditLog[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async log(data: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
    const auditLog: AuditLog = {
      ...data,
      id: uuidv4(),
      createdAt: new Date(),
    };

    this.auditLogs.push(auditLog);

    await cacheService.invalidate(`audit:${data.userId}`);
    this.eventBus.emit('audit:logged', { auditLog });

    return auditLog;
  }

  async query(query: AuditQuery): Promise<AuditLog[]> {
    let logs = [...this.auditLogs];

    if (query.userId) {
      logs = logs.filter(log => log.userId === query.userId);
    }

    if (query.action) {
      logs = logs.filter(log => log.action === query.action);
    }

    if (query.resource) {
      logs = logs.filter(log => log.resource === query.resource);
    }

    if (query.startDate) {
      logs = logs.filter(log => log.createdAt >= query.startDate!);
    }

    if (query.endDate) {
      logs = logs.filter(log => log.createdAt <= query.endDate!);
    }

    logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = query.offset || 0;
    const limit = query.limit || 100;
    return logs.slice(offset, offset + limit);
  }

  async getStats(): Promise<{ totalLogs: number; uniqueUsers: number; topActions: Record<string, number> }> {
    const totalLogs = this.auditLogs.length;
    const uniqueUsers = new Set(this.auditLogs.map(log => log.userId)).size;
    
    const actionCounts: Record<string, number> = {};
    for (const log of this.auditLogs) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    }

    return { totalLogs, uniqueUsers, topActions: actionCounts };
  }

  async getRecentActivity(userId: string, limit: number = 10): Promise<AuditLog[]> {
    return this.query({ userId, limit });
  }

  async clearOldLogs(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const initialCount = this.auditLogs.length;
    this.auditLogs = this.auditLogs.filter(log => log.createdAt > cutoff);
    return initialCount - this.auditLogs.length;
  }
}

export const auditService = new AuditService(new EventBus());
