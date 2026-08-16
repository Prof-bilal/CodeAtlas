import { AuditRepository } from '../database/repositories/auditRepository.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';

export interface AuditService {
  log(data: any): Promise<any>;
  getLogsByUser(userId: string): Promise<any[]>;
  getLogsByResource(resource: string, resourceId?: string): Promise<any[]>;
  getLogsByAction(action: string): Promise<any[]>;
  getCount(userId?: string): Promise<number>;
  deleteOldLogs(olderThanDays: number): Promise<number>;
}

export class AuditServiceImpl implements AuditService {
  private auditRepository: AuditRepository;

  constructor() {
    this.auditRepository = new AuditRepository();
  }

  async log(data: any): Promise<any> {
    const auditLog = await this.auditRepository.create(data);

    await eventBus.publish('audit.log_created', {
      auditLogId: auditLog.id,
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
    }, 'audit-service');

    return auditLog;
  }

  async getLogsByUser(userId: string): Promise<any[]> {
    return this.auditRepository.findByUserId(userId);
  }

  async getLogsByResource(resource: string, resourceId?: string): Promise<any[]> {
    return this.auditRepository.findByResource(resource, resourceId);
  }

  async getLogsByAction(action: string): Promise<any[]> {
    return this.auditRepository.findByAction(action);
  }

  async getCount(userId?: string): Promise<number> {
    return this.auditRepository.count(userId);
  }

  async deleteOldLogs(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    return this.auditRepository.deleteOlderThan(cutoffDate);
  }
}

export const auditService = new AuditServiceImpl();
