export function lerp<number>(...args: any[]): number {
  return start + (end - start) * clamp(t, 0, 1);
}