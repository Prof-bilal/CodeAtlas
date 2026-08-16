import { JwtStrategy, JwtPayloadData } from '../strategies/jwtStrategy.js';

export interface TokenValidationResult {
  valid: boolean;
  payload?: JwtPayloadData;
  error?: string;
  expired?: boolean;
}

export interface TokenBlacklistEntry {
  token: string;
  expiresAt: Date;
  reason: string;
}

export class TokenValidator {
  private jwtStrategy: JwtStrategy;
  private blacklist: Map<string, TokenBlacklistEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(jwtStrategy: JwtStrategy) {
    this.jwtStrategy = jwtStrategy;
    this.cleanupInterval = setInterval(() => this.cleanupBlacklist(), 60 * 60 * 1000);
  }

  validateAccessToken(token: string): TokenValidationResult {
    if (this.isBlacklisted(token)) {
      return { valid: false, error: 'Token has been revoked' };
    }
    try {
      const payload = this.jwtStrategy.verifyAccessToken(token);
      return { valid: true, payload };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const expired = message.includes('expired');
      return { valid: false, error: message, expired };
    }
  }

  validateRefreshToken(token: string): TokenValidationResult {
    if (this.isBlacklisted(token)) {
      return { valid: false, error: 'Token has been revoked' };
    }
    try {
      const payload = this.jwtStrategy.verifyRefreshToken(token);
      return { valid: true, payload };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const expired = message.includes('expired');
      return { valid: false, error: message, expired };
    }
  }

  blacklistToken(token: string, reason: string = 'revoked'): void {
    try {
      const decoded = this.jwtStrategy.decodeToken(token);
      if (decoded && decoded.exp) {
        const expiresAt = new Date(decoded.exp * 1000);
        this.blacklist.set(token, { token, expiresAt, reason });
      }
    } catch {
      // Token is invalid, no need to blacklist
    }
  }

  blacklistAllUserTokens(userId: string): number {
    let count = 0;
    for (const [token, entry] of this.blacklist.entries()) {
      // In a real implementation, we'd track tokens by user ID
      // For now, this is a placeholder
      count++;
    }
    return count;
  }

  isBlacklisted(token: string): boolean {
    return this.blacklist.has(token);
  }

  getBlacklistSize(): number {
    return this.blacklist.size;
  }

  private cleanupBlacklist(): void {
    const now = new Date();
    for (const [token, entry] of this.blacklist.entries()) {
      if (now > entry.expiresAt) {
        this.blacklist.delete(token);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
