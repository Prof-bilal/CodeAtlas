export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  
  return chunks;
}

export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key]);
    groups[groupKey] = groups[groupKey] || [];
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

export function flatten<T>(array: T[][]): T[] {
  return array.reduce((flat, item) => flat.concat(item), []);
}

export function compact<T>(array: (T | null | undefined)[]): T[] {
  return array.filter((item): item is T => item != null);
}

export function range(start: number, end: number, step: number = 1): number[] {
  const result: number[] = [];
  
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  
  return result;
}

export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

export function sample<T>(array: T[], count: number = 1): T[] {
  const shuffled = shuffle(array);
  return shuffled.slice(0, count);
}

export function sum(array: number[]): number {
  return array.reduce((acc, val) => acc + val, 0);
}

export function average(array: number[]): number {
  if (array.length === 0) return 0;
  return sum(array) / array.length;
}

export function min(array: number[]): number {
  return Math.min(...array);
}

export function max(array: number[]): number {
  return Math.max(...array);
}
