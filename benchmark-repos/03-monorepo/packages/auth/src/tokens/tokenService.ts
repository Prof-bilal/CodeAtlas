import { JwtStrategy, JwtTokenPair, JwtPayloadData } from '../strategies/jwtStrategy.js';
import { generateToken } from '@monorepo/shared';

export interface TokenConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
    issuer: string;
    audience: string;
  };
  passwordReset: {
    expiresInMs: number;
  };
  emailVerification: {
    expiresInMs: number;
  };
}

export interface PasswordResetToken {
  token: string;
  userId: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

export interface EmailVerificationToken {
  token: string;
  userId: string;
  email: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

const DEFAULT_TOKEN_CONFIG: TokenConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expiresIn: '1h',
    refreshExpiresIn: '30d',
    issuer: 'monorepo',
    audience: 'monorepo-api',
  },
  passwordReset: {
    expiresInMs: 60 * 60 * 1000,
  },
  emailVerification: {
    expiresInMs: 24 * 60 * 60 * 1000,
  },
};

export class TokenService {
  private jwtStrategy: JwtStrategy;
  private config: TokenConfig;
  private passwordResetTokens: Map<string, PasswordResetToken> = new Map();
  private emailVerificationTokens: Map<string, EmailVerificationToken> = new Map();

  constructor(config: Partial<TokenConfig> = {}) {
    this.config = { ...DEFAULT_TOKEN_CONFIG, ...config };
    this.jwtStrategy = new JwtStrategy(this.config.jwt);
  }

  generateTokenPair(payload: JwtPayloadData): JwtTokenPair {
    return this.jwtStrategy.generateTokenPair(payload);
  }

  verifyAccessToken(token: string): JwtPayloadData {
    return this.jwtStrategy.verifyAccessToken(token);
  }

  verifyRefreshToken(token: string): JwtPayloadData {
    return this.jwtStrategy.verifyRefreshToken(token);
  }

  generatePasswordResetToken(userId: string): string {
    this.cleanupPasswordResetTokens(userId);
    const token = generateToken(32);
    const resetToken: PasswordResetToken = {
      token,
      userId,
      expiresAt: new Date(Date.now() + this.config.passwordReset.expiresInMs),
      used: false,
      createdAt: new Date(),
    };
    this.passwordResetTokens.set(token, resetToken);
    return token;
  }

  verifyPasswordResetToken(token: string): PasswordResetToken | null {
    const resetToken = this.passwordResetTokens.get(token);
    if (!resetToken) return null;
    if (resetToken.used) return null;
    if (new Date() > resetToken.expiresAt) {
      this.passwordResetTokens.delete(token);
      return null;
    }
    resetToken.used = true;
    return resetToken;
  }

  generateEmailVerificationToken(userId: string, email: string): string {
    this.cleanupEmailVerificationTokens(userId);
    const token = generateToken(32);
    const verificationToken: EmailVerificationToken = {
      token,
      userId,
      email,
      expiresAt: new Date(Date.now() + this.config.emailVerification.expiresInMs),
      used: false,
      createdAt: new Date(),
    };
    this.emailVerificationTokens.set(token, verificationToken);
    return token;
  }

  verifyEmailVerificationToken(token: string): EmailVerificationToken | null {
    const verificationToken = this.emailVerificationTokens.get(token);
    if (!verificationToken) return null;
    if (verificationToken.used) return null;
    if (new Date() > verificationToken.expiresAt) {
      this.emailVerificationTokens.delete(token);
      return null;
    }
    verificationToken.used = true;
    return verificationToken;
  }

  private cleanupPasswordResetTokens(userId: string): void {
    for (const [token, resetToken] of this.passwordResetTokens.entries()) {
      if (resetToken.userId === userId || new Date() > resetToken.expiresAt) {
        this.passwordResetTokens.delete(token);
      }
    }
  }

  private cleanupEmailVerificationTokens(userId: string): void {
    for (const [token, verificationToken] of this.emailVerificationTokens.entries()) {
      if (verificationToken.userId === userId || new Date() > verificationToken.expiresAt) {
        this.emailVerificationTokens.delete(token);
      }
    }
  }

  cleanup(): number {
    let count = 0;
    const now = new Date();
    for (const [token, resetToken] of this.passwordResetTokens.entries()) {
      if (now > resetToken.expiresAt) {
        this.passwordResetTokens.delete(token);
        count++;
      }
    }
    for (const [token, verificationToken] of this.emailVerificationTokens.entries()) {
      if (now > verificationToken.expiresAt) {
        this.emailVerificationTokens.delete(token);
        count++;
      }
    }
    return count;
  }
}
