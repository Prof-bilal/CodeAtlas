import { logger } from '../utils/logger.js';
import { EventBus } from '../events/eventBus.js';
import { auditService } from '../audit/auditService.js';

export interface DashboardConfig {
  id: string;
  name: string;
  widgets: Widget[];
  layout: LayoutConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface Widget {
  id: string;
  type: 'chart' | 'table' | 'metric' | 'list';
  title: string;
  data?: any;
  config: Record<string, any>;
  position: { x: number; y: number; width: number; height: number };
}

export interface LayoutConfig {
  columns: number;
  rowHeight: number;
}

export class DashboardManager {
  private dashboards: DashboardConfig[] = [];

  async createDashboard(name: string, layout?: Partial<LayoutConfig>): Promise<DashboardConfig> {
    const dashboard: DashboardConfig = {
      id: crypto.randomUUID(),
      name,
      widgets: [],
      layout: {
        columns: layout?.columns || 12,
        rowHeight: layout?.rowHeight || 80,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.dashboards.push(dashboard);
    await auditService.log({
      userId: 'system',
      action: 'dashboard:created',
      resource: 'dashboard',
      resourceId: dashboard.id,
      details: { name },
      ipAddress: '127.0.0.1',
      userAgent: 'system',
    });

    return dashboard;
  }

  async getDashboard(id: string): Promise<DashboardConfig | undefined> {
    return this.dashboards.find(d => d.id === id);
  }

  async getAllDashboards(): Promise<DashboardConfig[]> {
    return this.dashboards;
  }

  async addWidget(dashboardId: string, widget: Omit<Widget, 'id'>): Promise<Widget> {
    const dashboard = await this.getDashboard(dashboardId);
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    const newWidget: Widget = {
      ...widget,
      id: crypto.randomUUID(),
    };

    dashboard.widgets.push(newWidget);
    dashboard.updatedAt = new Date();
    return newWidget;
  }

  async updateWidget(dashboardId: string, widgetId: string, updates: Partial<Widget>): Promise<Widget> {
    const dashboard = await this.getDashboard(dashboardId);
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    const widget = dashboard.widgets.find(w => w.id === widgetId);
    if (!widget) {
      throw new Error('Widget not found');
    }

    Object.assign(widget, updates);
    dashboard.updatedAt = new Date();
    return widget;
  }

  async removeWidget(dashboardId: string, widgetId: string): Promise<void> {
    const dashboard = await this.getDashboard(dashboardId);
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    dashboard.widgets = dashboard.widgets.filter(w => w.id !== widgetId);
    dashboard.updatedAt = new Date();
  }

  async deleteDashboard(id: string): Promise<void> {
    const index = this.dashboards.findIndex(d => d.id === id);
    if (index === -1) {
      throw new Error('Dashboard not found');
    }

    this.dashboards.splice(index, 1);
    await auditService.log({
      userId: 'system',
      action: 'dashboard:deleted',
      resource: 'dashboard',
      resourceId: id,
      details: {},
      ipAddress: '127.0.0.1',
      userAgent: 'system',
    });
  }

  async getDashboardStats(): Promise<{ totalDashboards: number; totalWidgets: number }> {
    const totalDashboards = this.dashboards.length;
    const totalWidgets = this.dashboards.reduce((sum, d) => sum + d.widgets.length, 0);
    return { totalDashboards, totalWidgets };
  }
}

export const dashboardManager = new DashboardManager();
