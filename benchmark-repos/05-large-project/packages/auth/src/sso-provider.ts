import { Result, Ok, Err } from '@atlas/shared';
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
}