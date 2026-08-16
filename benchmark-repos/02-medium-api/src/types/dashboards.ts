export interface DashboardWidget {
  id: string;
  type: string;
  title: string;
  data: any;
  config?: Record<string, any>;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface Dashboard {
  id: string;
  userId: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDashboardInput {
  name: string;
  description?: string;
  widgets?: DashboardWidget[];
  isDefault?: boolean;
}

export interface UpdateDashboardInput {
  name?: string;
  description?: string;
  widgets?: DashboardWidget[];
  isDefault?: boolean;
}

export interface DashboardStats {
  totalDashboards: number;
  totalWidgets: number;
  widgetsByType: Record<string, number>;
  lastUpdated?: Date;
}

export interface WidgetData {
  value: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
  label: string;
}

export const WIDGET_TYPES = [
  'metric',
  'chart',
  'table',
  'list',
  'gauge',
  'heatmap',
  'timeline',
  'comparison',
] as const;

export type WidgetType = typeof WIDGET_TYPES[number];

export const CHART_TYPES = [
  'line',
  'bar',
  'pie',
  'doughnut',
  'area',
  'scatter',
] as const;

export type ChartType = typeof CHART_TYPES[number];
