import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportGenerator } from '../../src/core/reports/reportGenerator.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('ReportGenerator', () => {
  let reportGenerator: ReportGenerator;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    reportGenerator = new ReportGenerator(mockEventBus);
  });

  describe('createReport', () => {
    it('should create a report config', async () => {
      const report = await reportGenerator.createReport({
        name: 'Monthly Revenue',
        type: 'payment_summary',
        format: 'json',
        recipients: ['admin@example.com'],
      });

      expect(report.id).toBeDefined();
      expect(report.name).toBe('Monthly Revenue');
    });
  });

  describe('generateReport', () => {
    it('should generate user activity report', async () => {
      const report = await reportGenerator.createReport({
        name: 'User Activity',
        type: 'user_activity',
        format: 'json',
        recipients: [],
      });

      const data = await reportGenerator.generateReport(report.id);
      expect(data.data.totalUsers).toBeDefined();
      expect(data.generatedAt).toBeDefined();
    });

    it('should generate payment summary report', async () => {
      const report = await reportGenerator.createReport({
        name: 'Payment Summary',
        type: 'payment_summary',
        format: 'json',
        recipients: [],
      });

      const data = await reportGenerator.generateReport(report.id);
      expect(data.data.totalRevenue).toBeDefined();
    });

    it('should fail for non-existent report', async () => {
      await expect(reportGenerator.generateReport('nonexistent')).rejects.toThrow('Report not found');
    });
  });

  describe('deleteReport', () => {
    it('should delete report', async () => {
      const report = await reportGenerator.createReport({
        name: 'Test',
        type: 'system_health',
        format: 'csv',
        recipients: [],
      });

      await reportGenerator.deleteReport(report.id);
      const all = await reportGenerator.getAllReports();
      expect(all).toHaveLength(0);
    });
  });
});
