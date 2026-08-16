export function clamp<number>(...args: any[]): number {
  return Math.min(Math.max(value, min), max);
}