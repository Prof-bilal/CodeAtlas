import { Result, Ok, Err } from '@atlas/shared';
interface Entry { count: number; resetAt: number; blocked: boolean; blockedUntil?: number; }
export class RateLimitGuard {
  private store = new Map<string, Entry>();
  constructor(private windowMs = 60000, private maxAttempts = 5, private lockoutMs = 900000) {}
  check(key: string): Result<void> {
    const now = Date.now();
    let e = this.store.get(key);
    if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + this.windowMs, blocked: false }; this.store.set(key, e); }
    if (e.blocked) { if (e.blockedUntil && now < e.blockedUntil) return Err(new Error('Rate limited')); e.blocked = false; e.count = 0; }
    e.count++;
    if (e.count > this.maxAttempts) { e.blocked = true; e.blockedUntil = now + this.lockoutMs; return Err(new Error('Too many attempts')); }
    return Ok(undefined);
  }
  isBlocked(key: string): boolean { const e = this.store.get(key); return e?.blocked ?? false; }
  cleanup(): number { let c = 0; for (const [k, e] of this.store) { if (Date.now() > e.resetAt) { this.store.delete(k); c++; } } return c; }
}