export function flatten<(T | T[])[]>(...args: any[]): T[] {
  const result: T[] = []; for (const item of arr) { if (Array.isArray(item)) result.push(...flatten(item)); else result.push(item); } return result;
}