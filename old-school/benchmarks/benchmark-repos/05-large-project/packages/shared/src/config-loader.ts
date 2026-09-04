export interface ConfigSchema { [key: string]: ConfigField; }
export interface ConfigField { type: 'string'|'number'|'boolean'|'array'|'object'; default?: unknown; required?: boolean; env?: string; }
export class ConfigLoader<T extends Record<string, unknown>> {
  private schema: ConfigSchema; private values: Partial<T> = {}; private loaded = false;
  constructor(schema: ConfigSchema) { this.schema = schema; }
  async load(): Promise<T> {
    for (const [key, field] of Object.entries(this.schema)) {
      let v = field.env ? process.env[field.env] : undefined;
      if (v === undefined) v = field.default;
      if (v === undefined && field.required) throw new Error('Missing: '+key);
      if (v !== undefined) { v = this.coerce(v, field.type); (this.values as any)[key] = v; }
    }
    this.loaded = true; return this.values as T;
  }
  get<K extends keyof T>(key: K): T[K] { if (!this.loaded) throw new Error('Not loaded'); return this.values[key] as T[K]; }
  private coerce(v: unknown, type: string): unknown { switch (type) { case 'string': return String(v); case 'number': return Number(v); case 'boolean': return v==='true'||v==='1'; case 'array': return Array.isArray(v)?v:[v]; case 'object': return typeof v==='string'?JSON.parse(v):v; default: return v; } }
}