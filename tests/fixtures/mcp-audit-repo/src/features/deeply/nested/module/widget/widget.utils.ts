export interface WidgetConfig {
  title: string;
  width: number;
  height: number;
  visible: boolean;
}

export function widgetHelper(config: Partial<WidgetConfig>): WidgetConfig {
  return { title: "widget", width: 100, height: 100, visible: true, ...config };
}

export function flattenWidget(config: WidgetConfig): string[] {
  return [config.title, String(config.width), String(config.height)];
}