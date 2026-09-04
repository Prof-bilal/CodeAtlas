import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportGenerator } from '../src/core/reports/reportGenerator.js';

describe('ReportGenerator', () => {
  let generator: ReportGenerator;

  beforeEach(() => {
    generator = new ReportGenerator();
  });

  it('should create report', () => {
    const report = generator.createReport({
      userId: 'user-1',
      name: 'Monthly Sales Report',
      type: 'sales',
      parameters: { startDate: '2024-01-01', endDate: '2024-01-31' },
    });

    expect(report).toBeDefined();
    expect(report.id).toBeDefined();
    expect(report.name).toBe('Monthly Sales Report');
  });

  it('should get report', () => {
    const report = generator.createReport({
      userId: 'user-1',
      name: 'Test Report',
      type: 'test',
      parameters: {},
    });

    const retrieved = generator.getReport(report.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Test Report');
  });

  it('should list reports for user', () => {
    generator.createReport({ userId: 'user-1', name: 'Report 1', type: 'test', parameters: {} });
    generator.createReport({ userId: 'user-1', name: 'Report 2', type: 'test', parameters: {} });
    generator.createReport({ userId: 'user-2', name: 'Other Report', type: 'test', parameters: {} });

    const reports = generator.listReports('user-1');
    expect(reports.length).toBe(2);
  });

  it('should update report', () => {
    const report = generator.createReport({
      userId: 'user-1',
      name: 'Original',
      type: 'test',
      parameters: {},
    });

    const updated = generator.updateReport(report.id, { name: 'Updated' });
    expect(updated?.name).toBe('Updated');
  });

  it('should delete report', () => {
    const report = generator.createReport({
      userId: 'user-1',
      name: 'To Delete',
      type: 'test',
      parameters: {},
    });

    const deleted = generator.deleteReport(report.id);
    expect(deleted).toBe(true);
  });

  it('should generate report', async () => {
    const report = generator.createReport({
      userId: 'user-1',
      name: 'Test Report',
      type: 'test',
      parameters: {},
    });

    const result = await generator.generateReport(report.id);
    expect(result.status).toBe('completed');
    expect(result.data).toBeDefined();
  });

  it('should get results for report', async () => {
    const report = generator.createReport({
      userId: 'user-1',
      name: 'Test Report',
      type: 'test',
      parameters: {},
    });

    await generator.generateReport(report.id);
    await generator.generateReport(report.id);

    const results = generator.listResults(report.id);
    expect(results.length).toBe(2);
  });
});
