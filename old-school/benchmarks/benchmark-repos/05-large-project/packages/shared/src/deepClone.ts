export function deepClone<T>(...args: any[]): T {
  if (obj === null || typeof obj !== 'object') return obj; if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as T; const clone = {} as T; for (const key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { (clone as any)[key] = deepClone((obj as any)[key]); } } return clone;
}