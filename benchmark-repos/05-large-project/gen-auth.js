// gen-auth.js
const { ENTITIES, DOMAINS, pick, write } = require('./gen-modules/utils');
const path = require('path');
const BASE = __dirname;
let count = 0;
const base = path.join(BASE, 'packages/auth/src');

write(path.join(base, 'token-service.ts'), `import { UserId, JWT, Result, Ok, Err } from '@atlas/shared';
import { createHmac, randomBytes } from 'crypto';
export interface TokenPayload { sub: UserId; iss: string; aud: string; exp: number; iat: number; jti: string; roles: string[]; organizationId?: string; }
export interface TokenPair { accessToken: JWT; refreshToken: string; expiresIn: number; tokenType: string; }
export class TokenService {
  constructor(private accessSecret: string, private refreshSecret: string, private accessTTL = 3600, private refreshTTL = 2592000) {}
  async generateTokenPair(userId: UserId, roles: string[], organizationId?: string): Promise<Result<TokenPair>> {
    const now = Math.floor(Date.now() / 1000);
    const jti = randomBytes(16).toString('hex');
    const access = this.sign({ sub: userId, iss: 'CodeAtlas', aud: 'API', exp: now + this.accessTTL, iat: now, jti, roles, organizationId }, this.accessSecret);
    const refresh = this.sign({ sub: userId, jti, type: 'refresh', iss: 'CodeAtlas', aud: 'Refresh', exp: now + this.refreshTTL, iat: now }, this.refreshSecret);
    return Ok({ accessToken: access as JWT, refresh, expiresIn: this.accessTTL, tokenType: 'Bearer' });
  }
  async verifyAccessToken(token: string): Promise<Result<TokenPayload>> {
    try { const p = this.verify(token, this.accessSecret) as TokenPayload; if (p.exp < Math.floor(Date.now() / 1000)) return Err(new Error('Expired')); return Ok(p); }
    catch { return Err(new Error('Invalid')); }
  }
  private sign(payload: Record<string, unknown>, secret: string): string {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return h + '.' + b + '.' + createHmac('sha256', secret).update(h + '.' + b).digest('base64url');
  }
  private verify(token: string, secret: string): Record<string, unknown> {
    const [h, b, s] = token.split('.');
    if (!h || !b || !s) throw new Error('Invalid');
    if (s !== createHmac('sha256', secret).update(h + '.' + b).digest('base64url')) throw new Error('Bad sig');
    return JSON.parse(Buffer.from(b, 'base64url').toString());
  }
}`);
count++;

write(path.join(base, 'permission-service.ts'), `import { Result, Ok, Err } from '@atlas/shared';
export type Permission = 'user:create' | 'user:read' | 'user:update' | 'user:delete' | 'project:create' | 'project:read' | 'project:update' | 'project:delete' | 'task:create' | 'task:read' | 'task:update' | 'admin:access' | 'admin:users' | 'payment:create' | 'payment:read';
export type Role = 'owner' | 'admin' | 'manager' | 'member' | 'viewer' | 'guest';
const HIERARCHY: Record<Role, number> = { owner: 6, admin: 5, manager: 4, member: 3, viewer: 2, guest: 1 };
const DEFAULTS: Record<Role, Permission[]> = {
  owner: ['admin:access','admin:users','user:create','user:read','user:update','user:delete','project:create','project:read','project:update','project:delete','task:create','task:read','task:update','payment:create','payment:read'],
  admin: ['admin:access','admin:users','user:create','user:read','user:update','user:delete','project:create','project:read','project:update','project:delete','task:create','task:read','task:update','payment:read'],
  manager: ['project:create','project:read','project:update','task:create','task:read','task:update','task:delete'],
  member: ['project:read','task:create','task:read','task:update'],
  viewer: ['project:read','task:read'],
  guest: ['project:read'],
};
export class PermissionService {
  getPermissionsForRole(role: Role): Permission[] { return DEFAULTS[role] ?? []; }
  hasPermission(role: Role, perm: Permission): boolean { return this.getPermissionsForRole(role).includes(perm); }
  hasAnyPermission(role: Role, perms: Permission[]): boolean { return perms.some(p => this.hasPermission(role, p)); }
  canAccess(userRole: Role, requiredRole: Role): boolean { return HIERARCHY[userRole] >= HIERARCHY[requiredRole]; }
  getHighestRole(roles: Role[]): Role | null { return roles.length > 0 ? roles.reduce((h, r) => HIERARCHY[r] > HIERARCHY[h] ? r : h) : null; }
}`);
count++;

write(path.join(base, 'auth-guard.ts'), `import { UserId, Result, Ok, Err } from '@atlas/shared';
import { TokenService, TokenPayload } from './token-service.js';
import { PermissionService, Permission, Role } from './permission-service.js';
export interface AuthContext { userId: UserId; roles: Role[]; organizationId?: string; permissions: Permission[]; sessionId: string; }
export interface GuardOptions { permissions?: Permission[]; roles?: Role[]; requireOrganization?: boolean; }
export class AuthGuard {
  constructor(private tokens: TokenService, private perms: PermissionService) {}
  async authenticate(token: string): Promise<Result<AuthContext>> {
    const p = await this.tokens.verifyAccessToken(token);
    if (!p.ok) return p;
    const roles = p.value.roles as Role[];
    const highest = this.perms.getHighestRole(roles);
    return Ok({ userId: p.value.sub as UserId, roles, organizationId: p.value.organizationId, permissions: highest ? this.perms.getPermissionsForRole(highest) : [], sessionId: p.value.jti });
  }
  authorize(ctx: AuthContext, opts: GuardOptions): Result<void> {
    if (opts.roles?.length && !opts.roles.some(r => ctx.roles.includes(r))) return Err(new Error('Insufficient role'));
    if (opts.requireOrganization && !ctx.organizationId) return Err(new Error('Organization required'));
    return Ok(undefined);
  }
  extractToken(authHeader: string | undefined): Result<string> {
    if (!authHeader) return Err(new Error('No auth header'));
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return Err(new Error('Invalid format'));
    return Ok(parts[1]);
  }
}`);
count++;

write(path.join(base, 'session-manager.ts'), `import { UserId, Result, Ok, Err, generateId } from '@atlas/shared';
export interface Session { id: string; userId: UserId; token: string; ip: string; expiresAt: Date; lastActivityAt: Date; isActive: boolean; }
export class SessionManager {
  private sessions = new Map<string, Session>();
  private userSessions = new Map<UserId, Set<string>>();
  private maxSessions: number;
  constructor(maxSessions = 10) { this.maxSessions = maxSessions; }
  async createSession(userId: UserId, token: string, ip: string): Promise<Result<Session>> {
    const count = this.userSessions.get(userId)?.size ?? 0;
    if (count >= this.maxSessions) this.evictOldest(userId);
    const now = new Date();
    const session: Session = { id: generateId(), userId, token, ip, expiresAt: new Date(now.getTime() + 3600000), lastActivityAt: now, isActive: true };
    this.sessions.set(session.id, session);
    if (!this.userSessions.has(userId)) this.userSessions.set(userId, new Set());
    this.userSessions.get(userId)!.add(session.id);
    return Ok(session);
  }
  async getSession(id: string): Promise<Result<Session>> {
    const s = this.sessions.get(id);
    if (!s) return Err(new Error('Not found'));
    if (!s.isActive) return Err(new Error('Inactive'));
    if (new Date() > s.expiresAt) { s.isActive = false; return Err(new Error('Expired')); }
    return Ok(s);
  }
  async invalidateSession(id: string): Promise<Result<void>> {
    const s = this.sessions.get(id); if (!s) return Err(new Error('Not found'));
    s.isActive = false; this.userSessions.get(s.userId)?.delete(id); return Ok(undefined);
  }
  async invalidateAllSessions(userId: UserId): Promise<Result<void>> {
    const ids = this.userSessions.get(userId);
    if (ids) { for (const id of ids) { const s = this.sessions.get(id); if (s) s.isActive = false; } ids.clear(); }
    return Ok(undefined);
  }
  private evictOldest(userId: UserId) {
    const ids = this.userSessions.get(userId); if (!ids?.size) return;
    let oldest: Session | null = null;
    for (const id of ids) { const s = this.sessions.get(id); if (s && (!oldest || s.lastActivityAt < oldest.lastActivityAt)) oldest = s; }
    if (oldest) { oldest.isActive = false; ids.delete(oldest.id); this.sessions.delete(oldest.id); }
  }
}`);
count++;

write(path.join(base, 'password-policy.ts'), `export interface PasswordPolicyConfig { minLength: number; maxLength: number; requireUppercase: boolean; requireLowercase: boolean; requireNumbers: boolean; requireSpecial: boolean; preventReuse: number; lockoutAttempts: number; }
export class PasswordPolicy {
  private config: PasswordPolicyConfig;
  private history = new Map<string, string[]>();
  constructor(config?: Partial<PasswordPolicyConfig>) { this.config = { minLength: 8, maxLength: 128, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSpecial: true, preventReuse: 5, lockoutAttempts: 5, ...config }; }
  validate(password: string): { valid: boolean; errors: string[]; score: number } {
    const errors: string[] = [];
    if (password.length < this.config.minLength) errors.push('Too short');
    if (password.length > this.config.maxLength) errors.push('Too long');
    if (this.config.requireUppercase && !/[A-Z]/.test(password)) errors.push('Needs uppercase');
    if (this.config.requireLowercase && !/[a-z]/.test(password)) errors.push('Needs lowercase');
    if (this.config.requireNumbers && !/[0-9]/.test(password)) errors.push('Needs number');
    if (this.config.requireSpecial && !/[!@#$%^&*]/.test(password)) errors.push('Needs special');
    let score = 0;
    if (password.length >= 8) score++; if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++; if (/[^a-zA-Z0-9]/.test(password)) score++;
    return { valid: errors.length === 0, errors, score };
  }
  isLockedOut(userId: string, attempts: number): boolean { return attempts >= this.config.lockoutAttempts; }
}`);
count++;

write(path.join(base, 'rate-limit-guard.ts'), `import { Result, Ok, Err } from '@atlas/shared';
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
}`);
count++;

write(path.join(base, 'sso-provider.ts'), `import { Result, Ok, Err } from '@atlas/shared';
export interface SSOConfig { provider: string; clientId: string; clientSecret: string; redirectUri: string; scopes: string[]; }
export interface SSOUserInfo { id: string; email: string; firstName: string; lastName: string; avatarUrl?: string; provider: string; emailVerified: boolean; }
export class SSOProvider {
  private stateStore = new Map<string, { expiresAt: number }>();
  constructor(private config: SSOConfig) {}
  getAuthorizationUrl(state?: string): Result<string> {
    const sv = state ?? Math.random().toString(36).substr(2);
    this.stateStore.set(sv, { expiresAt: Date.now() + 600000 });
    const params = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri, response_type: 'code', scope: this.config.scopes.join(' '), state: sv });
    return Ok(this.getBaseUrl() + '/authorize?' + params.toString());
  }
  async validateCallback(code: string, state: string): Promise<Result<SSOUserInfo>> {
    const sd = this.stateStore.get(state);
    if (!sd || Date.now() > sd.expiresAt) { this.stateStore.delete(state); return Err(new Error('Invalid state')); }
    this.stateStore.delete(state);
    try { const tokens = await this.exchangeCode(code); if (!tokens.ok) return tokens; return this.fetchUserInfo(tokens.value.access_token); }
    catch (e) { return Err(e as Error); }
  }
  private async exchangeCode(code: string) {
    const params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.config.redirectUri, client_id: this.config.clientId, client_secret: this.config.clientSecret });
    const resp = await fetch(this.getBaseUrl() + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    if (!resp.ok) return Err(new Error('Exchange failed'));
    return Ok(await resp.json() as { access_token: string; refresh_token: string });
  }
  private async fetchUserInfo(accessToken: string): Promise<Result<SSOUserInfo>> {
    const resp = await fetch(this.getBaseUrl() + '/userinfo', { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!resp.ok) return Err(new Error('Failed'));
    const d = await resp.json() as any;
    return Ok({ id: d.sub, email: d.email, firstName: d.given_name ?? '', lastName: d.family_name ?? '', avatarUrl: d.picture, provider: this.config.provider, emailVerified: d.email_verified ?? false });
  }
  private getBaseUrl(): string {
    const urls: Record<string, string> = { google: 'https://accounts.google.com/o/oauth2/v2', github: 'https://github.com/login/oauth' };
    return urls[this.config.provider] ?? '';
  }
}`);
count++;

write(path.join(base, 'index.ts'), `export * from './token-service.js';
export * from './permission-service.js';
export * from './auth-guard.js';
export * from './session-manager.js';
export * from './password-policy.js';
export * from './rate-limit-guard.js';
export * from './sso-provider.js';`);
count++;

// Generate 143 more auth files
for (let i = 0; i < 143; i++) {
  const type = pick(['guard','middleware','interceptor','provider','handler','strategy','adapter','filter','validator','checker','verifier','enforcer','manager','helper']);
  const domain = pick(DOMAINS);
  const dc = domain.charAt(0).toUpperCase() + domain.slice(1);
  const tc = type.charAt(0).toUpperCase() + type.slice(1);
  write(path.join(base, `${type.toLowerCase()}-${domain.toLowerCase()}-${i}.ts`), `import { Result, Ok, Err, Logger } from '@atlas/shared';

export interface Config${i} {
  enabled: boolean;
  timeout: number;
  retries: number;
  cacheResults: boolean;
  cacheTTL: number;
  metadata: Record<string, unknown>;
}

export class ${dc}${tc}${i} {
  private config: Config${i};
  private logger: Logger;
  private cache = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(config?: Partial<Config${i}>) {
    this.config = { enabled: true, timeout: 30000, retries: 3, cacheResults: true, cacheTTL: 300000, metadata: {}, ...config };
    this.logger = new Logger({ context: '${dc}${tc}${i}' });
  }

  async execute(request: { id: string; userId?: string; data: Record<string, unknown> }): Promise<Result<unknown>> {
    if (!this.config.enabled) return Ok({ success: true });
    const cacheKey = request.id + ':' + (request.userId ?? '');
    if (this.config.cacheResults) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) return Ok(cached.value);
    }
    const start = Date.now();
    try {
      this.logger.debug('Executing');
      const result = await this.process(request);
      if (this.config.cacheResults) {
        this.cache.set(cacheKey, { value: result, expiresAt: Date.now() + this.config.cacheTTL });
      }
      this.logger.debug('Completed', { duration: Date.now() - start });
      return Ok(result);
    } catch (error) {
      this.logger.error('Failed', error as Error);
      return Err(error as Error);
    }
  }

  private async process(request: { id: string; data: Record<string, unknown> }): Promise<unknown> {
    await new Promise(r => setTimeout(r, Math.random() * 10));
    return { processed: true, timestamp: new Date().toISOString() };
  }

  async invalidateCache(pattern?: string): Promise<number> {
    if (!pattern) { this.cache.clear(); return 0; }
    let count = 0;
    for (const key of this.cache.keys()) { if (key.includes(pattern)) { this.cache.delete(key); count++; } }
    return count;
  }

  getStats() { return { enabled: this.config.enabled, cacheSize: this.cache.size }; }
}`);
  count++;
}

console.log('Auth created: ' + count + ' files');
