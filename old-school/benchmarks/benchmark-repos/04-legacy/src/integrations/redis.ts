// Redis integration - CURRENT

export class Redis {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async setex(key: string, ttl: number, value: string): Promise<void> {
    this.store.set(key, value);
    setTimeout(() => this.store.delete(key), ttl * 1000);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return Array.from(this.store.keys()).filter(k => k.includes(pattern));
  }
}
