import { query, queryOne } from '../config/database.js';
import { AuditLog } from '../models/index.js';

export class AuditRepository {
  async create(input: {
    userId: string | null;
    action: string;
    resource: string;
    resourceId?: string;
    changes?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    const row = await queryOne<any>(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, changes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.userId,
        input.action,
        input.resource,
        input.resourceId || null,
        input.changes ? JSON.stringify(input.changes) : null,
        input.ipAddress || null,
        input.userAgent || null,
      ]
    );
    
    return this.mapRowToAuditLog(row!);
  }

  async findById(id: string): Promise<AuditLog | null> {
    const row = await queryOne<any>(
      'SELECT * FROM audit_logs WHERE id = $1',
      [id]
    );
    
    if (!row) return null;
    
    return this.mapRowToAuditLog(row);
  }

  async findAll(
    limit: number = 50,
    offset: number = 0,
    filters: {
      userId?: string;
      action?: string;
      resource?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<AuditLog[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(filters.userId);
    }

    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      values.push(filters.action);
    }

    if (filters.resource) {
      conditions.push(`resource = $${paramIndex++}`);
      values.push(filters.resource);
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query<any>(
      `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, limit, offset]
    );

    return rows.map(this.mapRowToAuditLog);
  }

  async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<AuditLog[]> {
    const rows = await query<any>(
      'SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    
    return rows.map(this.mapRowToAuditLog);
  }

  async findByResource(resource: string, resourceId: string): Promise<AuditLog[]> {
    const rows = await query<any>(
      'SELECT * FROM audit_logs WHERE resource = $1 AND resource_id = $2 ORDER BY created_at DESC',
      [resource, resourceId]
    );
    
    return rows.map(this.mapRowToAuditLog);
  }

  async count(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<number> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(filters.userId);
    }

    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      values.push(filters.action);
    }

    if (filters.resource) {
      conditions.push(`resource = $${paramIndex++}`);
      values.push(filters.resource);
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`,
      values
    );

    return parseInt(result?.count || '0', 10);
  }

  async countByUserId(userId: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM audit_logs WHERE user_id = $1',
      [userId]
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async countToday(): Promise<number> {
    const result = await queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM audit_logs WHERE created_at >= CURRENT_DATE"
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async countUniqueUsers(): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(DISTINCT user_id) as count FROM audit_logs WHERE user_id IS NOT NULL'
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async getTopActions(limit: number = 10): Promise<{ action: string; count: number }[]> {
    const rows = await query<any>(
      `SELECT action, COUNT(*) as count 
       FROM audit_logs 
       GROUP BY action 
       ORDER BY count DESC 
       LIMIT $1`,
      [limit]
    );
    
    return rows.map(row => ({
      action: row.action,
      count: parseInt(row.count, 10),
    }));
  }

  async getTopResources(limit: number = 10): Promise<{ resource: string; count: number }[]> {
    const rows = await query<any>(
      `SELECT resource, COUNT(*) as count 
       FROM audit_logs 
       GROUP BY resource 
       ORDER BY count DESC 
       LIMIT $1`,
      [limit]
    );
    
    return rows.map(row => ({
      resource: row.resource,
      count: parseInt(row.count, 10),
    }));
  }

  async findRecent(limit: number = 10): Promise<AuditLog[]> {
    const rows = await query<any>(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    
    return rows.map(this.mapRowToAuditLog);
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await query(
      'DELETE FROM audit_logs WHERE created_at < $1',
      [date]
    );
    
    return result.length;
  }

  private mapRowToAuditLog(row: any): AuditLog {
    return {
      id: row.id,
      userId: row.user_id,
      action: row.action,
      resource: row.resource,
      resourceId: row.resource_id,
      changes: row.changes ? (typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes) : null,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: new Date(row.created_at),
    };
  }
}

export const auditRepository = new AuditRepository();
