export function groupBy<T, K extends string | number>(...args: any[]): Record<K, T[]> {
  return items.reduce((acc, item) => { const key = keyFn(item); if (!acc[key]) acc[key] = []; acc[key].push(item); return acc; }, {} as Record<K, T[]>);
}