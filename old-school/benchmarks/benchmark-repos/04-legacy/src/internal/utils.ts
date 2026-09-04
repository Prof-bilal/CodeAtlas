// Internal utilities

export function generateRequestId(): string {
  return eq__;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return ${ms}ms;
  if (ms < 60000) return ${(ms / 1000).toFixed(1)}s;
  return ${(ms / 60000).toFixed(1)}m;
}

// TODO: these are used by old code
export function legacyFormatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function legacyParseDate(str: string): Date {
  return new Date(str);
}
