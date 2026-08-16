import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardManager } from '../src/core/dashboards/dashboardManager.js';

describe('DashboardManager', () => {
  let manager: DashboardManager;

  beforeEach(() => {
    manager = new DashboardManager();
  });

  it('should create dashboard', () => {
    const dashboard = manager.createDashboard({
      userId: 'user-1',
      name: 'My Dashboard',
      widgets: [],
      isDefault: false,
    });

    expect(dashboard).toBeDefined();
    expect(dashboard.id).toBeDefined();
    expect(dashboard.name).toBe('My Dashboard');
  });

  it('should get dashboard', () => {
    const dashboard = manager.createDashboard({
      userId: 'user-1',
      name: 'My Dashboard',
      widgets: [],
      isDefault: false,
    });

    const retrieved = manager.getDashboard(dashboard.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('My Dashboard');
  });

  it('should list dashboards for user', () => {
    manager.createDashboard({ userId: 'user-1', name: 'Dashboard 1', widgets: [], isDefault: false });
    manager.createDashboard({ userId: 'user-1', name: 'Dashboard 2', widgets: [], isDefault: false });
    manager.createDashboard({ userId: 'user-2', name: 'Other Dashboard', widgets: [], isDefault: false });

    const dashboards = manager.listDashboards('user-1');
    expect(dashboards.length).toBe(2);
  });

  it('should update dashboard', () => {
    const dashboard = manager.createDashboard({
      userId: 'user-1',
      name: 'Original',
      widgets: [],
      isDefault: false,
    });

    const updated = manager.updateDashboard(dashboard.id, { name: 'Updated' });
    expect(updated?.name).toBe('Updated');
  });

  it('should delete dashboard', () => {
    const dashboard = manager.createDashboard({
      userId: 'user-1',
      name: 'To Delete',
      widgets: [],
      isDefault: false,
    });

    const deleted = manager.deleteDashboard(dashboard.id);
    expect(deleted).toBe(true);
  });

  it('should add widget', () => {
    const dashboard = manager.createDashboard({
      userId: 'user-1',
      name: 'My Dashboard',
      widgets: [],
      isDefault: false,
    });

    const widget = manager.addWidget(dashboard.id, {
      type: 'metric',
      title: 'Total Users',
      data: { value: 100 },
      position: { x: 0, y: 0, width: 4, height: 3 },
    });

    expect(widget).toBeDefined();
    expect(widget?.type).toBe('metric');
  });

  it('should update widget', () => {
    const dashboard = manager.createDashboard({
      userId: 'user-1',
      name: 'My Dashboard',
      widgets: [],
      isDefault: false,
    });

    const widget = manager.addWidget(dashboard.id, {
      type: 'metric',
      title: 'Total Users',
      data: { value: 100 },
      position: { x: 0, y: 0, width: 4, height: 3 },
    });

    const updated = manager.updateWidget(dashboard.id, widget!.id, { title: 'Updated Users' });
    expect(updated?.title).toBe('Updated Users');
  });

  it('should remove widget', () => {
    const dashboard = manager.createDashboard({
      userId: 'user-1',
      name: 'My Dashboard',
      widgets: [],
      isDefault: false,
    });

    const widget = manager.addWidget(dashboard.id, {
      type: 'metric',
      title: 'Total Users',
      data: { value: 100 },
      position: { x: 0, y: 0, width: 4, height: 3 },
    });

    const removed = manager.removeWidget(dashboard.id, widget!.id);
    expect(removed).toBe(true);
  });

  it('should set default dashboard', () => {
    const dashboard = manager.createDashboard({
      userId: 'user-1',
      name: 'Default Dashboard',
      widgets: [],
      isDefault: false,
    });

    const result = manager.setDefaultDashboard('user-1', dashboard.id);
    expect(result).toBe(true);

    const defaultDashboard = manager.getDefaultDashboard('user-1');
    expect(defaultDashboard?.id).toBe(dashboard.id);
  });
});
