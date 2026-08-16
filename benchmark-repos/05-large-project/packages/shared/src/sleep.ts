export function sleep<number>(...args: any[]): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}