import { JwtStrategy, JwtPayloadData } from '../strategies/jwtStrategy.js';
import { generateToken, hashPassword, verifyPassword } from '@monorepo/shared';

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  tokenSalt: string;
  sessionId: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
  isActive: boolean;
  userAgent?: string;
  ipAddress?: string;
}

export interface CreateRefreshTokenRequest {
  userId: string;
  sessionId: string;
  userAgent?: string;
  ipAddress?: string;
  expiresInMs?: number;
}

export class RefreshTokenService {
  private tokens: Map<string, RefreshToken> = new Map();
  private tokenToId: Map<string, string> = new Map();
  private userTokens: Map<string, Set<string>> = new Map();
  private jwtStrategy: JwtStrategy;
  private maxTokensPerUser: number;
  private defaultExpiresInMs: number;

  constructor(
    jwtStrategy: JwtStrategy,
    maxTokensPerUser: number = 5,
    defaultExpiresInMs: number = 30 * 24 * 60 * 60 * 1000
  ) {
    this.jwtStrategy = jwtStrategy;
    this.maxTokensPerUser = maxTokensPerUser;
    this.defaultExpiresInMs = defaultExpiresInMs;
  }

  createRefreshToken(request: CreateRefreshTokenRequest): { refreshToken: RefreshToken; rawToken: string } {
    const userTokenIds = this.userTokens.get(request.userId) || new Set();
    if (userTokenIds.size >= this.maxTokensPerUser) {
      const oldestTokenId = Array.from(userTokenIds)[0];
      this.revokeRefreshToken(oldestTokenId);
    }
    const rawToken = generateToken(48);
    const { hash, salt } = hashPassword(rawToken);
    const refreshToken: RefreshToken = {
      id: generateToken(24),
      userId: request.userId,
      tokenHash: hash,
      tokenSalt: salt,
      sessionId: request.sessionId,
      expiresAt: new Date(Date.now() + (request.expiresInMs || this.defaultExpiresInMs)),
      createdAt: new Date(),
      lastUsedAt: new Date(),
      isActive: true,
      userAgent: request.userAgent,
      ipAddress: request.ipAddress,
    };
    this.tokens.set(refreshToken.id, refreshToken);
    this.tokenToId.set(rawToken, refreshToken.id);
    if (!this.userTokens.has(request.userId)) {
      this.userTokens.set(request.userId, new Set());
    }
    this.userTokens.get(request.userId)!.add(refreshToken.id);
    return { refreshToken, rawToken };
  }

  validateRefreshToken(rawToken: string): RefreshToken | null {
    const tokenId = this.tokenToId.get(rawToken);
    if (!tokenId) return null;
    const token = this.tokens.get(tokenId);
    if (!token) return null;
    if (!token.isActive) return null;
    if (new Date() > token.expiresAt) {
      this.revokeRefreshToken(tokenId);
      return null;
    }
    if (!verifyPassword(rawToken, token.tokenHash, token.tokenSalt)) {
      return null;
    }
    token.lastUsedAt = new Date();
    return token;
  }

  revokeRefreshToken(tokenId: string): boolean {
    const token = this.tokens.get(tokenId);
    if (!token) return false;
    token.isActive = false;
    this.tokens.delete(tokenId);
    this.userTokens.get(token.userId)?.delete(tokenId);
    return true;
  }

  revokeAllUserRefreshTokens(userId: string): number {
    const tokenIds = this.userTokens.get(userId);
    if (!tokenIds) return 0;
    let count = 0;
    for (const tokenId of Array.from(tokenIds)) {
      this.revokeRefreshToken(tokenId);
      count++;
    }
    return count;
  }

  rotateRefreshToken(rawToken: string): { refreshToken: RefreshToken; newRawToken: string } | null {
    const token = this.validateRefreshToken(rawToken);
    if (!token) return null;
    this.revokeRefreshToken(token.id);
    return this.createRefreshToken({
      userId: token.userId,
      sessionId: token.sessionId,
      userAgent: token.userAgent,
      ipAddress: token.ipAddress,
    });
  }

  getUserRefreshTokens(userId: string): RefreshToken[] {
    const tokenIds = this.userTokens.get(userId) || new Set();
    return Array.from(tokenIds)
      .map(id => this.tokens.get(id))
      .filter((t): t is RefreshToken => t !== undefined && t.isActive);
  }

  cleanupExpiredTokens(): number {
    const now = new Date();
    let count = 0;
    for (const [id, token] of this.tokens.entries()) {
      if (now > token.expiresAt) {
        this.revokeRefreshToken(id);
        count++;
      }
    }
    return count;
  }

  getActiveTokenCount(): number {
    return Array.from(this.tokens.values()).filter(t => t.isActive).length;
  }

  getActiveTokenCountByUser(userId: string): number {
    return this.getUserRefreshTokens(userId).length;
  }
}
