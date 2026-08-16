export interface AuthMiddlewareConfig {
  jwtSecret: string;
  excludePaths: string[];
}

export interface AuthenticatedRequest {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

export interface MiddlewareResult {
  success: boolean;
  request?: AuthenticatedRequest;
  error?: string;
  statusCode?: number;
}

export class AuthMiddleware {
  private config: AuthMiddlewareConfig;
  private tokenBlacklist: Set<string> = new Set();

  constructor(config: AuthMiddlewareConfig) {
    this.config = config;
  }

  async authenticate(token: string): Promise<MiddlewareResult> {
    if (!token) {
      return { success: false, error: 'No token provided', statusCode: 401 };
    }
    if (this.tokenBlacklist.has(token)) {
      return { success: false, error: 'Token has been revoked', statusCode: 401 };
    }
    try {
      const payload = this.verifyToken(token);
      return {
        success: true,
        request: {
          userId: payload.sub,
          email: payload.email,
          role: payload.role,
          sessionId: payload.sessionId,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      return { success: false, error: message, statusCode: 401 };
    }
  }

  private verifyToken(token: string): { sub: string; email: string; role: string; sessionId: string; exp: number } {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token has expired');
    }
    return payload;
  }

  isExcluded(path: string): boolean {
    return this.config.excludePaths.some(excluded => path.startsWith(excluded));
  }

  blacklistToken(token: string): void {
    this.tokenBlacklist.add(token);
  }

  isTokenBlacklisted(token: string): boolean {
    return this.tokenBlacklist.has(token);
  }

  cleanupBlacklist(): number {
    const size = this.tokenBlacklist.size;
    return size;
  }
}

export function createAuthMiddleware(config: AuthMiddlewareConfig): AuthMiddleware {
  return new AuthMiddleware(config);
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
