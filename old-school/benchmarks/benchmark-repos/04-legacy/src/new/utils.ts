// New utilities - EXPERIMENTAL
// Not yet integrated

export function newFormatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US').format(date);
}

export function newParseDate(str: string): Date {
  return new Date(str);
}
