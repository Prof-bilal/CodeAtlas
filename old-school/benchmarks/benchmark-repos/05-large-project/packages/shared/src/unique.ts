export function unique<T>(...args: any[]): T[] {
  const seen = new Set<string | number>(); return arr.filter(item => { const key = keyFn ? keyFn(item) : item as any; if (seen.has(key)) return false; seen.add(key); return true; });
}