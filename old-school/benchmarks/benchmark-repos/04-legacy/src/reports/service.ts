// Report service - CURRENT

import { Database } from '../database/connection';
import { Redis } from '../integrations/redis';
import { Logger } from '../utils';
import { v4 as uuidv4 } from 'uuid';

export interface Report {
  id: string;
  name: string;
  type: 'revenue' | 'users' | 'activity' | 'custom';
  parameters: Record<string, any>;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  resultUrl: string | null;
  scheduledAt: Date | null;
  generatedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ReportSchedule {
  id: string;
  reportId: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  time: string;
  recipients: string[];
  active: boolean;
}

export class ReportService {
  private db: Database;
  private redis: Redis;

  constructor(db: Database, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  async createReport(input: {
    name: string;
    type: Report['type'];
    parameters: Record<string, any>;
    scheduledAt?: Date;
  }): Promise<Report> {
    const id = uuidv4();

    const report: Report = {
      id,
      name: input.name,
      type: input.type,
      parameters: input.parameters,
      status: 'pending',
      resultUrl: null,
      scheduledAt: input.scheduledAt || null,
      generatedAt: null,
      expiresAt: null,
      createdAt: new Date(),
    };

    await this.db.query(
      INSERT INTO reports (id, name, type, parameters, status, scheduled_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?),
      [id, input.name, input.type, JSON.stringify(input.parameters),
       'pending', input.scheduledAt?.toISOString() || null, report.createdAt.toISOString()]
    );

    Logger.info(Report created: );

    // Generate immediately if not scheduled
    if (!input.scheduledAt) {
      this.generateReport(id).catch(err => {
        Logger.error(Report generation failed: , err);
      });
    }

    return report;
  }

  async getReport(id: string): Promise<Report | null> {
    const results = await this.db.query(
      'SELECT * FROM reports WHERE id = ?',
      [id]
    ) as any[];

    return results.length > 0 ? this.mapRow(results[0]) : null;
  }

  async listReports(options: { type?: Report['type']; limit?: number } = {}): Promise<Report[]> {
    let query = 'SELECT * FROM reports';
    const params: any[] = [];

    if (options.type) {
      query += ' WHERE type = ?';
      params.push(options.type);
    }

    query += ' ORDER BY created_at DESC';
    query +=  LIMIT ;

    const results = await this.db.query(query, params) as any[];
    return results.map(this.mapRow);
  }

  async generateReport(id: string): Promise<void> {
    const report = await this.getReport(id);
    if (!report) throw new Error('Report not found');

    await this.updateStatus(id, 'generating');

    try {
      let data: any;

      switch (report.type) {
        case 'revenue':
          data = await this.generateRevenueReport(report.parameters);
          break;
        case 'users':
          data = await this.generateUsersReport(report.parameters);
          break;
        case 'activity':
          data = await this.generateActivityReport(report.parameters);
          break;
        case 'custom':
          data = await this.generateCustomReport(report.parameters);
          break;
      }

      // Save report result
      const resultUrl = /reports//result.json;
      await this.db.query(
        UPDATE reports SET status = 'completed', result_url = ?, generated_at = ?, expires_at = ? WHERE id = ?,
        [resultUrl, new Date().toISOString(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), id]
      );

      Logger.info(Report generated: );

    } catch (err: any) {
      await this.db.query(
        "UPDATE reports SET status = 'failed' WHERE id = ?",
        [id]
      );
      throw err;
    }
  }

  async scheduleReport(reportId: string, schedule: Omit<ReportSchedule, 'id' | 'reportId'>): Promise<ReportSchedule> {
    const id = uuidv4();

    await this.db.query(
      INSERT INTO report_schedules (id, report_id, frequency, day_of_week, day_of_month, time, recipients, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?),
      [id, reportId, schedule.frequency, schedule.dayOfWeek || null,
       schedule.dayOfMonth || null, schedule.time, JSON.stringify(schedule.recipients), schedule.active]
    );

    return {
      id,
      reportId,
      ...schedule,
    };
  }

  private async generateRevenueReport(params: Record<string, any>): Promise<any> {
    const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = params.endDate || new Date();

    const results = await this.db.query(
      SELECT
         DATE(created_at) as date,
         COUNT(*) as transactions,
         SUM(amount) as revenue,
         AVG(amount) as avg_transaction
       FROM payments
       WHERE status = 'succeeded' AND created_at >= ? AND created_at <= ?
       GROUP BY DATE(created_at)
       ORDER BY date,
      [startDate, endDate]
    ) as any[];

    return {
      period: { start: startDate, end: endDate },
      daily: results,
      totals: {
        transactions: results.reduce((sum: number, r: any) => sum + r.transactions, 0),
        revenue: results.reduce((sum: number, r: any) => sum + r.revenue, 0),
      },
    };
  }

  private async generateUsersReport(params: Record<string, any>): Promise<any> {
    const results = await this.db.query(
      SELECT
         DATE(created_at) as date,
         COUNT(*) as new_users
       FROM users
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY DATE(created_at)
       ORDER BY date,
      [params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), params.endDate || new Date()]
    ) as any[];

    const totalUsers = await this.db.query('SELECT COUNT(*) as count FROM users') as any[];

    return {
      daily: results,
      totalUsers: totalUsers[0].count,
    };
  }

  private async generateActivityReport(params: Record<string, any>): Promise<any> {
    return { activity: [] };
  }

  private async generateCustomReport(params: Record<string, any>): Promise<any> {
    return { custom: true };
  }

  private async updateStatus(id: string, status: Report['status']): Promise<void> {
    await this.db.query(
      'UPDATE reports SET status = ? WHERE id = ?',
      [status, id]
    );
  }

  private mapRow(row: any): Report {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : row.parameters,
      status: row.status,
      resultUrl: row.result_url,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
      generatedAt: row.generated_at ? new Date(row.generated_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
