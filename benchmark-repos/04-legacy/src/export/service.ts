// Export service - CURRENT

import { Database } from '../database/connection';
import { Logger } from '../utils';
import { v4 as uuidv4 } from 'uuid';

export interface ExportJob {
  id: string;
  userId: string;
  type: 'users' | 'payments' | 'analytics' | 'all';
  format: 'csv' | 'json' | 'xlsx';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileUrl: string | null;
  fileSize: number | null;
  recordCount: number | null;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export class ExportService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async createExportJob(userId: string, type: ExportJob['type'], format: ExportJob['format']): Promise<ExportJob> {
    const id = uuidv4();

    const job: ExportJob = {
      id,
      userId,
      type,
      format,
      status: 'pending',
      fileUrl: null,
      fileSize: null,
      recordCount: null,
      error: null,
      createdAt: new Date(),
      completedAt: null,
    };

    await this.db.query(
      INSERT INTO export_jobs (id, user_id, type, format, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?),
      [id, userId, type, format, 'pending', job.createdAt.toISOString()]
    );

    Logger.info(Export job created: );

    // Start processing asynchronously
    this.processExport(id).catch(err => {
      Logger.error(Export processing failed: , err);
    });

    return job;
  }

  async getExportJob(id: string): Promise<ExportJob | null> {
    const results = await this.db.query(
      'SELECT * FROM export_jobs WHERE id = ?',
      [id]
    ) as any[];

    return results.length > 0 ? this.mapRow(results[0]) : null;
  }

  async getUserExportJobs(userId: string): Promise<ExportJob[]> {
    const results = await this.db.query(
      'SELECT * FROM export_jobs WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    ) as any[];

    return results.map(this.mapRow);
  }

  private async processExport(jobId: string): Promise<void> {
    const job = await this.getExportJob(jobId);
    if (!job) return;

    await this.updateStatus(jobId, 'processing');

    try {
      let records: any[] = [];

      switch (job.type) {
        case 'users':
          records = await this.db.query('SELECT * FROM users') as any[];
          break;
        case 'payments':
          records = await this.db.query('SELECT * FROM payments WHERE user_id = ?', [job.userId]) as any[];
          break;
        case 'analytics':
          records = await this.db.query('SELECT * FROM analytics_events WHERE user_id = ?', [job.userId]) as any[];
          break;
        case 'all':
          // Export all user data
          break;
      }

      // Generate file content
      let content: string;
      if (job.format === 'json') {
        content = JSON.stringify(records, null, 2);
      } else if (job.format === 'csv') {
        content = this.convertToCSV(records);
      } else {
        content = JSON.stringify(records); // Fallback
      }

      // Save file (simplified - in production would use S3 or similar)
      const fileUrl = /exports/.;
      const fileSize = Buffer.byteLength(content);

      await this.db.query(
        UPDATE export_jobs SET status = 'completed', file_url = ?, file_size = ?, record_count = ?, completed_at = ? WHERE id = ?,
        [fileUrl, fileSize, records.length, new Date().toISOString(), jobId]
      );

      Logger.info(Export completed:  -  records);

    } catch (err: any) {
      await this.db.query(
        "UPDATE export_jobs SET status = 'failed', error = ? WHERE id = ?",
        [err.message, jobId]
      );
    }
  }

  private async updateStatus(id: string, status: ExportJob['status']): Promise<void> {
    await this.db.query(
      'UPDATE export_jobs SET status = ? WHERE id = ?',
      [status, id]
    );
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(header => JSON.stringify(row[header] || '')).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  private mapRow(row: any): ExportJob {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      format: row.format,
      status: row.status,
      fileUrl: row.file_url,
      fileSize: row.file_size,
      recordCount: row.record_count,
      error: row.error,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  }
}
