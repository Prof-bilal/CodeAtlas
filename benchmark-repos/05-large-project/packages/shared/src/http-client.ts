import { Result, Ok, Err } from './result.js';
export interface HttpClientConfig { baseUrl: string; timeout: number; retries: number; retryDelay: number; headers: Record<string, string>; }
export interface HttpRequest { method: string; url: string; headers: Record<string, string>; body?: unknown; query?: Record<string, string>; timeout?: number; }
export interface HttpResponse<T = unknown> { status: number; headers: Record<string, string>; data: T; duration: number; }
export class HttpClient {
  private config: HttpClientConfig;
  private cb: CircuitBreaker;
  constructor(config: Partial<HttpClientConfig> & { baseUrl: string }) {
    this.config = { timeout: 30000, retries: 3, retryDelay: 1000, headers: {}, ...config };
    this.cb = new CircuitBreaker(5, 30000);
  }
  async get<T>(url: string, opts?: Partial<HttpRequest>): Promise<Result<HttpResponse<T>>> { return this.request<T>({ method: 'GET', url, headers: {}, ...opts }); }
  async post<T>(url: string, body?: unknown): Promise<Result<HttpResponse<T>>> { return this.request<T>({ method: 'POST', url, headers: {}, body }); }
  async put<T>(url: string, body?: unknown): Promise<Result<HttpResponse<T>>> { return this.request<T>({ method: 'PUT', url, headers: {}, body }); }
  async delete<T>(url: string): Promise<Result<HttpResponse<T>>> { return this.request<T>({ method: 'DELETE', url, headers: {} }); }
  private async request<T>(req: HttpRequest): Promise<Result<HttpResponse<T>>> {
    if (!this.cb.canExecute()) return Err(new Error('Circuit breaker open'));
    let lastErr: Error | null = null;
    for (let i = 0; i <= this.config.retries; i++) {
      try {
        const start = Date.now();
        const resp = await fetch(new URL(req.url, this.config.baseUrl).toString(), { method: req.method, headers: req.headers, body: req.body ? JSON.stringify(req.body) : undefined });
        const data = await resp.json() as T;
        this.cb.recordSuccess();
        return Ok({ status: resp.status, headers: Object.fromEntries(resp.headers.entries()), data, duration: Date.now() - start });
      } catch (e) { lastErr = e as Error; if (i < this.config.retries) await new Promise(r => setTimeout(r, this.config.retryDelay * (i + 1))); }
    }
    this.cb.recordFailure();
    return Err(lastErr!);
  }
}
export class CircuitBreaker {
  private failures = 0; private lastFailure = 0; private state: 'closed'|'open'|'half-open' = 'closed';
  constructor(private threshold: number, private resetTimeout: number) {}
  canExecute(): boolean { if (this.state === 'closed') return true; if (this.state === 'open' && Date.now() - this.lastFailure > this.resetTimeout) { this.state = 'half-open'; return true; } return false; }
  recordSuccess(): void { this.failures = 0; this.state = 'closed'; }
  recordFailure(): void { this.failures++; this.lastFailure = Date.now(); if (this.failures >= this.threshold) this.state = 'open'; }
}