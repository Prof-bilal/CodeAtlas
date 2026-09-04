export function merge<Record<string, unknown>>(...args: any[]): T {
  const result = { ...target }; for (const source of sources) { for (const key in source) { if (source[key] !== undefined) (result as any)[key] = source[key]; } } return result;
}