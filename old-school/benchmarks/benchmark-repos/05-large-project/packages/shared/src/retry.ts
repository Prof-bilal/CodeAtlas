import { Result, Ok, Err } from './result.js';
export interface RetryConfig { maxAttempts: number; baseDelay: number; maxDelay: number; backoffMultiplier: number; retryOn: (e: Error) => boolean; onRetry?: (attempt: number, e: Error) => void; }
const defaults: RetryConfig = { maxAttempts: 3, baseDelay: 1000, maxDelay: 30000, backoffMultiplier: 2, retryOn: () => true };
export async function withRetry<T>(fn: () => Promise<T>, config?: Partial<RetryConfig>): Promise<Result<T, Error>> {
  const cfg = { ...defaults, ...config }; let lastErr: Error | null = null;
  for (let i = 1; i <= cfg.maxAttempts; i++) { try { return Ok(await fn()); } catch (e) { lastErr = e as Error; if (i < cfg.maxAttempts && cfg.retryOn(lastErr)) { await new Promise(r => setTimeout(r, Math.min(cfg.baseDelay * Math.pow(cfg.backoffMultiplier, i-1), cfg.maxDelay))); cfg.onRetry?.(i, lastErr); } } }
  return Err(lastErr!);
}
export function isRetryableError(e: Error): boolean { const codes = ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND']; if (codes.includes((e as any).code)) return true; if ('status' in e) { const s = (e as any).status; return s===429||s===502||s===503||s===504; } return false; }