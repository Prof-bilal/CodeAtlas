export interface FormatOptions {
  indent?: number;
  indentChar?: string;
  lineEnding?: string;
  maxLineLength?: number;
}

export function formatJson(obj: unknown, options: FormatOptions = {}): string {
  const { indent = 2, indentChar = ' ', lineEnding = '\n' } = options;
  return JSON.stringify(obj, null, indent).replace(/\n/g, lineEnding);
}

export function formatCode(code: string, options: FormatOptions = {}): string {
  const { indent = 2, indentChar = ' ' } = options;
  const lines = code.split('\n');
  let indentLevel = 0;
  return lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith(')')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }
    const formatted = indentChar.repeat(indentLevel * indent) + trimmed;
    if (trimmed.endsWith('{') || trimmed.endsWith('[') || trimmed.endsWith('(')) {
      indentLevel++;
    }
    return formatted;
  }).join('\n');
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('en-US', options).format(value);
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatOrdinal(value: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = value % 100;
  return value + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

export function formatList(items: string[], conjunction: string = 'and'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`;
}

export function formatTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return String(data[key] ?? `{{${key}}}`);
  });
}

export function formatHtmlEscaped(str: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

export function formatSlug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function formatCamelCase(str: string): string {
  return str.replace(/[-_ ]+([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function formatSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
}

export function formatKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).replace(/^-/, '');
}

export function formatPascalCase(str: string): string {
  return formatCamelCase(str).replace(/^./, letter => letter.toUpperCase());
}
