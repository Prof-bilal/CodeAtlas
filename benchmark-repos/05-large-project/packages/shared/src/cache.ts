export interface CacheEntry<T> { value: T; expiresAt: number; hits: number; }
export interface CacheConfig { maxSize: number; defaultTTL: number; strategy: 'lru'|'lfu'|'fifo'; }
export class Cache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private config: CacheConfig;
  constructor(config?: Partial<CacheConfig>) { this.config = { maxSize: config?.maxSize??10000, defaultTTL: config?.defaultTTL??300000, strategy: config?.strategy??'lru' }; }
  get(key: string): T | undefined {
    const e = this.store.get(key); if (!e) return undefined;
    if (Date.now() > e.expiresAt) { this.store.delete(key); this.accessOrder = this.accessOrder.filter(k=>k!==key); return undefined; }
    e.hits++; if (this.config.strategy==='lru') { this.accessOrder = this.accessOrder.filter(k=>k!==key); this.accessOrder.push(key); }
    return e.value;
  }
  set(key: string, value: T, ttl?: number): void { if (this.store.size>=this.config.maxSize) this.evict(); this.store.set(key, { value, expiresAt: Date.now()+(ttl??this.config.defaultTTL), hits: 0 }); this.accessOrder.push(key); }
  has(key: string): boolean { return this.get(key)!==undefined; }
  delete(key: string): boolean { this.accessOrder = this.accessOrder.filter(k=>k!==key); return this.store.delete(key); }
  clear(): void { this.store.clear(); this.accessOrder = []; }
  getOrSet(key: string, factory: () => T|Promise<T>, ttl?: number): T|Promise<T> { const c = this.get(key); if (c!==undefined) return c; const v = factory(); if (v instanceof Promise) return v.then(vv => { this.set(key, vv, ttl); return vv; }); this.set(key, v, ttl); return v; }
  size(): number { return this.store.size; }
  private evict(): void { if (this.accessOrder.length===0) return; this.delete(this.accessOrder[0]); }
}