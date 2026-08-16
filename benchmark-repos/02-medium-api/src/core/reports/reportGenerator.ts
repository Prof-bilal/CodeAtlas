import { logger } from '../utils/logger.js';
import { auditService } from '../audit/auditService.js';
import { EventBus } from '../events/eventBus.js';

export interface ReportConfig {
  id: string;
  name: string;
  type: 'user_activity' | 'payment_summary' | 'system_health' | 'custom';
  schedule?: string;
  format: 'json' | 'csv' | 'pdf';
  recipients: string[];
  createdAt: Date;
  lastGenerated?: Date;
}

export interface ReportData {
  reportId: string;
  data: any;
  generatedAt: Date;
  format: string;
}

export class ReportGenerator {
  private reports: ReportConfig[] = [];
  private generatedReports: ReportData[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async createReport(config: Omit<ReportConfig, 'id' | 'createdAt'>): Promise<ReportConfig> {
    const report: ReportConfig = {
      ...config,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };

    this.reports.push(report);
    return report;
  }

  async getReport(id: string): Promise<ReportConfig | undefined> {
    return this.reports.find(r => r.id === id);
  }

  async getAllReports(): Promise<ReportConfig[]> {
    return this.reports;
  }

  async generateReport(id: string): Promise<ReportData> {
    const report = await this.getReport(id);
    if (!report) {
      throw new Error('Report not found');
    }

    let data: any;

    switch (report.type) {
      case 'user_activity':
        data = await this.generateUserActivityReport();
        break;
      case 'payment_summary':
        data = await this.generatePaymentSummaryReport();
        break;
      case 'system_health':
        data = await this.generateSystemHealthReport();
        break;
      default:
        data = { message: 'Custom report generated' };
    }

    const reportData: ReportData = {
      reportId: id,
      data,
      generatedAt: new Date(),
      format: report.format,
    };

    this.generatedReports.push(reportData);
    report.lastGenerated = new Date();

    await auditService.log({
      userId: 'system',
      action: 'report:generated',
      resource: 'report',
      resourceId: id,
      details: { type: report.type, format: report.format },
      ipAddress: '127.0.0.1',
      userAgent: 'system',
    });

    this.eventBus.emit('report:generated', { reportId: id, type: report.type });

    return reportData;
  }

  private async generateUserActivityReport(): Promise<any> {
    return {
      totalUsers: 1234,
      activeUsers: 890,
      newUsersToday: 45,
      userGrowth: '+12%',
    };
  }

  private async generatePaymentSummaryReport(): Promise<any> {
    return {
      totalRevenue: 1234567,
      monthlyRevenue: 234567,
      averageTransaction: 99,
      refundRate: '2.3%',
    };
  }

  private async generateSystemHealthReport(): Promise<any> {
    return {
      uptime: '99.9%',
      responseTime: '45ms',
      errorRate: '0.1%',
      activeJobs: 23,
    };
  }

  async deleteReport(id: string): Promise<void> {
    const index = this.reports.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error('Report not found');
    }
    this.reports.splice(index, 1);
  }

  async getGeneratedReports(reportId: string): Promise<ReportData[]> {
    return this.generatedReports.filter(r => r.reportId === reportId);
  }
}

export const reportGenerator = new ReportGenerator(new EventBus());
