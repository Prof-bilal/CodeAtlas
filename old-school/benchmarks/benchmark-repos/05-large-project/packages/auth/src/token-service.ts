import { UserId, JWT, Result, Ok, Err } from '@atlas/shared';
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
}