export function pick<Record<string, unknown>, K extends keyof T>(...args: any[]): Pick<T, K> {
  const result = {} as Pick<T, K>; for (const key of keys) { if (key in obj) result[key] = obj[key]; } return result;
}