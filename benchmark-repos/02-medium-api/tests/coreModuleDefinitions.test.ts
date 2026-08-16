import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from '../src/core/workflows/workflowEngine.js';
import { IntegrationManager } from '../src/core/integrations/integrationManager.js';
import { DashboardManager } from '../src/core/dashboards/dashboardManager.js';
import { ReportGenerator } from '../src/core/reports/reportGenerator.js';

describe('Core Module Definitions', () => {
  it('should export WorkflowEngine', () => {
    expect(WorkflowEngine).toBeDefined();
  });

  it('should export IntegrationManager', () => {
    expect(IntegrationManager).toBeDefined();
  });

  it('should export DashboardManager', () => {
    expect(DashboardManager).toBeDefined();
  });

  it('should export ReportGenerator', () => {
    expect(ReportGenerator).toBeDefined();
  });
});
