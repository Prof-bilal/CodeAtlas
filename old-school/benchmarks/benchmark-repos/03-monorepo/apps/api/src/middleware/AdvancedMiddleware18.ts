export interface MiddlewareConfig18 {
  name: string;
  order: number;
  enabled: boolean;
  excludePaths: string[];
  includePaths: string[];
  logEnabled: boolean;
  timeoutMs: number;
}
export interface MiddlewareRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  userId?: string;
  roles?: string[];
  startTime: Date;
}
export interface MiddlewareResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}
export class Middleware18 {
  private config: MiddlewareConfig18;
  private executionCount = 0;
  private errorCount = 0;
  private executionLog: Array<{ path: string; duration: number; status: number; timestamp: Date }> = [];
  constructor(config: MiddlewareConfig18) { this.config = config; }
  async execute(req: MiddlewareRequest, res: MiddlewareResponse, next: () => Promise<void>): Promise<void> {
    if (!this.config.enabled) { await next(); return; }
    if (this.config.excludePaths.some(p => req.path.startsWith(p))) { await next(); return; }
    if (this.config.includePaths.length > 0 && !this.config.includePaths.some(p => req.path.startsWith(p))) { await next(); return; }
    const start = Date.now();
    this.executionCount++;
    try {
      await next();
      const duration = Date.now() - start;
      this.executionLog.push({ path: req.path, duration, status: res.status, timestamp: new Date() });
      if (this.config.logEnabled) console.log('[' + this.config.name + '] ' + req.method + ' ' + req.path + ' - ' + res.status + ' (' + duration + 'ms)');
    } catch (error) { this.errorCount++; throw error; }
  }
  getStats(): { executionCount: number; errorCount: number; logSize: number } { return { executionCount: this.executionCount, errorCount: this.errorCount, logSize: this.executionLog.length }; }
  getName(): string { return this.config.name; }
  getOrder(): number { return this.config.order; }
  destroy(): void { this.executionLog = []; }
}
export function createMiddleware18(config: MiddlewareConfig18): Middleware18 { return new Middleware18(config); }