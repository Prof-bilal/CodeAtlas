import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardManager } from '../../src/core/dashboards/dashboardManager.js';

describe('DashboardManager', () => {
  let dashboardManager: DashboardManager;

  beforeEach(() => {
    dashboardManager = new DashboardManager();
  });

  describe('createDashboard', () => {
    it('should create a dashboard', async () => {
      const dashboard = await dashboardManager.createDashboard('My Dashboard');
      expect(dashboard.id).toBeDefined();
      expect(dashboard.name).toBe('My Dashboard');
      expect(dashboard.layout.columns).toBe(12);
    });
  });

  describe('addWidget', () => {
    it('should add widget to dashboard', async () => {
      const dashboard = await dashboardManager.createDashboard('Test');
      const widget = await dashboardManager.addWidget(dashboard.id, {
        type: 'chart',
        title: 'Revenue Chart',
        config: { dataSource: 'payments' },
        position: { x: 0, y: 0, width: 6, height: 4 },
      });

      expect(widget.id).toBeDefined();
      expect(widget.title).toBe('Revenue Chart');
    });

    it('should throw for non-existent dashboard', async () => {
      await expect(dashboardManager.addWidget('nonexistent', {
        type: 'chart', title: 'T', config: {}, position: { x: 0, y: 0, width: 1, height: 1 },
      })).rejects.toThrow('Dashboard not found');
    });
  });

  describe('removeWidget', () => {
    it('should remove widget from dashboard', async () => {
      const dashboard = await dashboardManager.createDashboard('Test');
      const widget = await dashboardManager.addWidget(dashboard.id, {
        type: 'metric', title: 'M', config: {}, position: { x: 0, y: 0, width: 3, height: 2 },
      });

      await dashboardManager.removeWidget(dashboard.id, widget.id);
      const updated = await dashboardManager.getDashboard(dashboard.id);
      expect(updated!.widgets).toHaveLength(0);
    });
  });

  describe('deleteDashboard', () => {
    it('should delete dashboard', async () => {
      const dashboard = await dashboardManager.createDashboard('Test');
      await dashboardManager.deleteDashboard(dashboard.id);
      const all = await dashboardManager.getAllDashboards();
      expect(all).toHaveLength(0);
    });
  });

  describe('getDashboardStats', () => {
    it('should return stats', async () => {
      const d = await dashboardManager.createDashboard('D1');
      await dashboardManager.addWidget(d.id, { type: 'chart', title: 'C', config: {}, position: { x: 0, y: 0, width: 1, height: 1 } });
      await dashboardManager.addWidget(d.id, { type: 'table', title: 'T', config: {}, position: { x: 0, y: 1, width: 1, height: 1 } });

      const stats = await dashboardManager.getDashboardStats();
      expect(stats.totalDashboards).toBe(1);
      expect(stats.totalWidgets).toBe(2);
    });
  });
});
