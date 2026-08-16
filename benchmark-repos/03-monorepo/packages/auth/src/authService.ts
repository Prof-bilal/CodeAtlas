import { User, CreateUserRequest, UpdateUserRequest } from '@monorepo/shared';
import { hashPassword, verifyPassword, generateToken } from '@monorepo/shared';
import { TokenService } from './tokens/tokenService.js';
import { SessionStrategy, Session } from './strategies/sessionStrategy.js';
import { JwtTokenPair, JwtPayloadData } from './strategies/jwtStrategy.js';

export interface LoginRequest {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginResponse {
  user: User;
  tokens: JwtTokenPair;
  session: Session;
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
  role?: string;
}

export class AuthService {
  private users: Map<string, User> = new Map();
  private emailToId: Map<string, string> = new Map();
  private passwordHashes: Map<string, { hash: string; salt: string }> = new Map();
  private tokenService: TokenService;
  private sessionStrategy: SessionStrategy;

  constructor(tokenService: TokenService, sessionStrategy: SessionStrategy) {
    this.tokenService = tokenService;
    this.sessionStrategy = sessionStrategy;
  }

  async register(request: RegisterRequest): Promise<LoginResponse> {
    if (this.emailToId.has(request.email)) {
      throw new Error('Email already registered');
    }
    const { hash, salt } = hashPassword(request.password);
    const userId = generateToken(16);
    const user: User = {
      id: userId,
      email: request.email,
      name: request.name,
      role: (request.role as User['role']) || 'member',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        timezone: 'UTC',
        locale: 'en-US',
        preferences: {
          theme: 'system',
          notifications: { email: true, push: true, sms: false, frequency: 'instant' },
          dashboard: { layout: 'grid', defaultView: 'tasks', widgets: ['tasks', 'projects'] },
        },
      },
    };
    this.users.set(userId, user);
    this.emailToId.set(request.email, userId);
    this.passwordHashes.set(userId, { hash, salt });
    const tokens = this.generateTokens(user);
    const session = this.sessionStrategy.createSession({
      userId: user.id,
      userAgent: request.userAgent || 'unknown',
      ipAddress: request.ipAddress,
    });
    return { user, tokens, session };
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    const userId = this.emailToId.get(request.email);
    if (!userId) {
      throw new Error('Invalid credentials');
    }
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('Invalid credentials');
    }
    if (user.status !== 'active') {
      throw new Error('Account is not active');
    }
    const passwordData = this.passwordHashes.get(userId);
    if (!passwordData) {
      throw new Error('Invalid credentials');
    }
    if (!verifyPassword(request.password, passwordData.hash, passwordData.salt)) {
      throw new Error('Invalid credentials');
    }
    user.lastLoginAt = new Date();
    const tokens = this.generateTokens(user);
    const session = this.sessionStrategy.createSession({
      userId: user.id,
      userAgent: request.userAgent || 'unknown',
      ipAddress: request.ipAddress,
    });
    return { user, tokens, session };
  }

  async logout(sessionId: string): Promise<void> {
    this.sessionStrategy.destroySession(sessionId);
  }

  async refreshTokens(refreshToken: string): Promise<JwtTokenPair> {
    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    const user = this.users.get(payload.sub);
    if (!user) {
      throw new Error('User not found');
    }
    return this.generateTokens(user);
  }

  async getProfile(userId: string): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async updateProfile(userId: string, updates: UpdateUserRequest): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    if (updates.name) user.name = updates.name;
    if (updates.avatar) user.avatar = updates.avatar;
    if (updates.role) user.role = updates.role;
    if (updates.status) user.status = updates.status;
    if (updates.preferences) {
      user.metadata.preferences = {
        ...user.metadata.preferences,
        ...updates.preferences,
      };
    }
    user.updatedAt = new Date();
    return user;
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const passwordData = this.passwordHashes.get(userId);
    if (!passwordData) {
      throw new Error('User not found');
    }
    if (!verifyPassword(oldPassword, passwordData.hash, passwordData.salt)) {
      throw new Error('Invalid current password');
    }
    const { hash, salt } = hashPassword(newPassword);
    this.passwordHashes.set(userId, { hash, salt });
    this.sessionStrategy.destroyAllUserSessions(userId);
  }

  async verifyToken(token: string): Promise<User> {
    const payload = this.tokenService.verifyAccessToken(token);
    const user = this.users.get(payload.sub);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  private generateTokens(user: User): JwtTokenPair {
    const payload: JwtPayloadData = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: generateToken(16),
    };
    return this.tokenService.generateTokenPair(payload);
  }

  getUserById(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getUserByEmail(email: string): User | undefined {
    const userId = this.emailToId.get(email);
    return userId ? this.users.get(userId) : undefined;
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  deleteUser(userId: string): boolean {
    const user = this.users.get(userId);
    if (!user) return false;
    this.users.delete(userId);
    this.emailToId.delete(user.email);
    this.passwordHashes.delete(userId);
    this.sessionStrategy.destroyAllUserSessions(userId);
    return true;
  }
}
