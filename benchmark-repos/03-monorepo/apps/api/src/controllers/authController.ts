export interface AuthControllerConfig {
  jwtSecret: string;
  bcryptRounds: number;
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export class AuthController {
  private config: AuthControllerConfig;
  private users: Map<string, { id: string; email: string; name: string; passwordHash: string; role: string }> = new Map();
  private refreshTokens: Map<string, { userId: string; expiresAt: Date }> = new Map();

  constructor(config: AuthControllerConfig) {
    this.config = config;
  }

  async register(request: RegisterRequest): Promise<AuthResponse> {
    if (this.users.has(request.email)) {
      throw new Error('Email already registered');
    }
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const passwordHash = await this.hashPassword(request.password);
    const user = {
      id: userId,
      email: request.email,
      name: request.name,
      passwordHash,
      role: 'member',
    };
    this.users.set(request.email, user);
    return this.generateAuthResponse(user);
  }

  async login(request: LoginRequest): Promise<AuthResponse> {
    const user = this.users.get(request.email);
    if (!user) throw new Error('Invalid credentials');
    const valid = await this.verifyPassword(request.password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');
    return this.generateAuthResponse(user);
  }

  async refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const entry = this.refreshTokens.get(token);
    if (!entry) throw new Error('Invalid refresh token');
    if (new Date() > entry.expiresAt) {
      this.refreshTokens.delete(token);
      throw new Error('Refresh token expired');
    }
    const user = Array.from(this.users.values()).find(u => u.id === entry.userId);
    if (!user) throw new Error('User not found');
    this.refreshTokens.delete(token);
    return this.generateTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    this.refreshTokens.delete(refreshToken);
  }

  async getProfile(userId: string) {
    const user = Array.from(this.users.values()).find(u => u.id === userId);
    if (!user) throw new Error('User not found');
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  private async generateAuthResponse(user: { id: string; email: string; name: string; role: string }): Promise<AuthResponse> {
    const tokens = this.generateTokens(user);
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tokens,
    };
  }

  private generateTokens(user: { id: string; email: string; role: string }) {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = `refresh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    return { accessToken, refreshToken, expiresIn: 3600 };
  }

  private generateAccessToken(user: { id: string; email: string; role: string }): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url');
    const signature = Buffer.from(`${header}.${payload}.${this.config.jwtSecret}`).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }

  private async hashPassword(password: string): Promise<string> {
    return `hashed_${password}_${this.config.bcryptRounds}`;
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return hash.startsWith(`hashed_${password}_`);
  }
}

export function createAuthController(config: AuthControllerConfig): AuthController {
  return new AuthController(config);
}
