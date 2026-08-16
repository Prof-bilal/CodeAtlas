export interface RateLimiterConfig { windowMs: number; maxRequests: number; }
interface Entry { count: number; resetAt: number; }
export class RateLimiter {
  private store = new Map<string, Entry>();
  private config: RateLimiterConfig;
  constructor(config?: Partial<RateLimiterConfig>) { this.config = { windowMs: config?.windowMs??60000, maxRequests: config?.maxRequests??100 }; }
  async check(id: string): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter?: number }> {
    const now = Date.now(); let e = this.store.get(id);
    if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + this.config.windowMs }; this.store.set(id, e); }
    e.count++;
    if (e.count > this.config.maxRequests) return { allowed: false, remaining: 0, resetAt: e.resetAt, retryAfter: Math.ceil((e.resetAt-now)/1000) };
    return { allowed: true, remaining: Math.max(0, this.config.maxRequests - e.count), resetAt: e.resetAt };
  }
}