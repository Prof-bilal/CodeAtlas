export interface GuardConfig10 {
  name: string;
  permissions: string[];
  roles: string[];
  resources: string[];
  requireAll: boolean;
  cacheEnabled: boolean;
  cacheTtlMs: number;
}
export interface GuardContext10 {
  userId: string;
  roles: string[];
  permissions: string[];
  resource: string;
  resourceId?: string;
  action: string;
  metadata: Record<string, unknown>;
}
export interface GuardResult10 {
  allowed: boolean;
  reason?: string;
  checkedPermissions: string[];
  deniedPermissions: string[];
  duration: number;
}
export class Guard10 {
  private config: GuardConfig10;
  private decisionCache: Map<string, { result: GuardResult10; expiresAt: Date }> = new Map();
  private checkCount = 0;
  private decisionLog: Array<{ context: string; allowed: boolean; timestamp: Date }> = [];
  constructor(config: GuardConfig10) { this.config = config; }
  async check(context: GuardContext10): Promise<GuardResult10> {
    const start = Date.now();
    this.checkCount++;
    const cacheKey = context.userId + ':' + context.resource + ':' + context.action;
    if (this.config.cacheEnabled) { const cached = this.decisionCache.get(cacheKey); if (cached && cached.expiresAt > new Date()) return { ...cached.result, duration: Date.now() - start }; }
    const checkedPermissions: string[] = [];
    const deniedPermissions: string[] = [];
    let allowed = false;
    if (this.config.requireAll) {
      allowed = this.config.permissions.every(p => { checkedPermissions.push(p); if (!context.permissions.includes(p)) { deniedPermissions.push(p); return false; } return true; });
    } else {
      allowed = this.config.permissions.some(p => { checkedPermissions.push(p); return context.permissions.includes(p); });
    }
    if (allowed && this.config.roles.length > 0) allowed = this.config.roles.some(r => context.roles.includes(r));
    if (allowed && this.config.resources.length > 0) allowed = this.config.resources.includes(context.resource);
    const reason = allowed ? undefined : 'Access denied: missing [' + deniedPermissions.join(', ') + ']';
    const result: GuardResult10 = { allowed, reason, checkedPermissions, deniedPermissions, duration: Date.now() - start };
    if (this.config.cacheEnabled) this.decisionCache.set(cacheKey, { result, expiresAt: new Date(Date.now() + this.config.cacheTtlMs) });
    this.decisionLog.push({ context: cacheKey, allowed, timestamp: new Date() });
    if (this.decisionLog.length > 1000) this.decisionLog = this.decisionLog.slice(-500);
    return result;
  }
  clearCache(): void { this.decisionCache.clear(); }
  getStats(): { checkCount: number; cacheSize: number; decisionLogSize: number } { return { checkCount: this.checkCount, cacheSize: this.decisionCache.size, decisionLogSize: this.decisionLog.length }; }
  getName(): string { return this.config.name; }
  destroy(): void { this.decisionCache.clear(); this.decisionLog = []; }
}
export function createGuard10(config: GuardConfig10): Guard10 { return new Guard10(config); }