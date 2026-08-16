import { sign, verify, JwtPayload } from 'jsonwebtoken';
import { generateToken } from '@monorepo/shared';

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
  issuer: string;
  audience: string;
}

export interface JwtTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayloadData {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
}

const DEFAULT_CONFIG: JwtConfig = {
  secret: 'default-secret-change-me',
  expiresIn: '1h',
  refreshExpiresIn: '30d',
  issuer: 'monorepo',
  audience: 'monorepo-api',
};

export class JwtStrategy {
  private config: JwtConfig;

  constructor(config: Partial<JwtConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  generateTokenPair(payload: JwtPayloadData): JwtTokenPair {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);
    const expiresIn = this.parseExpiration(this.config.expiresIn);
    return { accessToken, refreshToken, expiresIn };
  }

  generateAccessToken(payload: JwtPayloadData): string {
    return sign(payload, this.config.secret, {
      expiresIn: this.config.expiresIn,
      issuer: this.config.issuer,
      audience: this.config.audience,
    });
  }

  generateRefreshToken(payload: JwtPayloadData): string {
    return sign({ ...payload, type: 'refresh' }, this.config.secret, {
      expiresIn: this.config.refreshExpiresIn,
      issuer: this.config.issuer,
      audience: this.config.audience,
    });
  }

  verifyAccessToken(token: string): JwtPayloadData {
    const decoded = verify(token, this.config.secret, {
      issuer: this.config.issuer,
      audience: this.config.audience,
    }) as JwtPayload & JwtPayloadData;
    if (decoded.type === 'refresh') {
      throw new Error('Invalid token type: expected access token');
    }
    return {
      sub: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId,
    };
  }

  verifyRefreshToken(token: string): JwtPayloadData {
    const decoded = verify(token, this.config.secret, {
      issuer: this.config.issuer,
      audience: this.config.audience,
    }) as JwtPayload & JwtPayloadData;
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type: expected refresh token');
    }
    return {
      sub: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId,
    };
  }

  decodeToken(token: string): JwtPayload | null {
    try {
      return verify(token, this.config.secret) as JwtPayload;
    } catch {
      return null;
    }
  }

  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) return 3600;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 3600;
    }
  }
}
