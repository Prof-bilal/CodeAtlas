export function omit<Record<string, unknown>, K extends keyof T>(...args: any[]): Omit<T, K> {
  const result = { ...obj }; for (const key of keys) { delete (result as any)[key]; } return result;
}