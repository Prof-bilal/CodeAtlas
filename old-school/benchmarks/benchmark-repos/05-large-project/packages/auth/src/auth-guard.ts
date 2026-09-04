import { UserId, Result, Ok, Err } from '@atlas/shared';
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
}