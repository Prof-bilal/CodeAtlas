import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../database/databaseService.js';
import { logger } from '../utils/logger.js';

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditRepository {
  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const id = uuidv4();
    const result = await databaseService.query<AuditLog>(
      `INSERT INTO audit_logs (id, user_id, action, resource, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, input.userId, input.action, input.resource, input.resourceId, input.details ? JSON.stringify(input.details) : null, input.ipAddress, input.userAgent]
    );
    return result.rows[0];
  }

  async findByUserId(userId: string, options?: { limit?: number; offset?: number }): Promise<AuditLog[]> {
    let query = 'SELECT * FROM audit_logs WHERE user_id = $1';
    const params: any[] = [userId];

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await databaseService.query<AuditLog>(query, params);
    return result.rows;
  }

  async findByResource(resource: string, resourceId?: string): Promise<AuditLog[]> {
    let query = 'SELECT * FROM audit_logs WHERE resource = $1';
    const params: any[] = [resource];

    if (resourceId) {
      query += ' AND resource_id = $2';
      params.push(resourceId);
    }

    query += ' ORDER BY created_at DESC';

    const result = await databaseService.query<AuditLog>(query, params);
    return result.rows;
  }

  async findByAction(action: string): Promise<AuditLog[]> {
    const result = await databaseService.query<AuditLog>(
      'SELECT * FROM audit_logs WHERE action = $1 ORDER BY created_at DESC',
      [action]
    );
    return result.rows;
  }

  async count(userId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM audit_logs';
    const params: any[] = [];

    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }

    const result = await databaseService.query<{ count: string }>(query, params);
    return parseInt(result.rows[0].count);
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await databaseService.query(
      'DELETE FROM audit_logs WHERE created_at < $1',
      [date]
    );
    return result.rowCount ?? 0;
  }
}

export const auditRepository = new AuditRepository();
