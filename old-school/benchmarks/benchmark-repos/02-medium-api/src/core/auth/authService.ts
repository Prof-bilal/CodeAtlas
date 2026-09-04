import bcrypt from 'bcryptjs';
import { authConfig } from '../../config/auth.js';
import { userRepository } from '../../repositories/userRepository.js';
import { sessionRepository } from '../../repositories/sessionRepository.js';
import { CreateUserInput, UserModel, UserResponse, toUserResponse } from '../../models/user.js';
import { jwtStrategy } from './strategies/jwtStrategy.js';
import { apiKeyStrategy } from './strategies/apiKeyStrategy.js';
import { ApiKey } from '../../models/index.js';

export interface AuthResult {
  user: UserResponse;
  token: string;
  refreshToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  async register(input: CreateUserInput): Promise<AuthResult> {
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new AppError('Email already registered', 409);
    }

    const user = await userRepository.create(input);
    const token = jwtStrategy.generateToken(user);
    const refreshToken = jwtStrategy.generateRefreshToken(user);
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await sessionRepository.create(user.id, refreshToken, expiresAt);

    return {
      user: toUserResponse(user),
      token,
      refreshToken,
    };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated', 403);
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = jwtStrategy.generateToken(user);
    const refreshToken = jwtStrategy.generateRefreshToken(user);
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await sessionRepository.create(user.id, refreshToken, expiresAt);

    return {
      user: toUserResponse(user),
      token,
      refreshToken,
    };
  }

  async logout(token: string): Promise<void> {
    await sessionRepository.delete(token);
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    const session = await sessionRepository.findByToken(refreshToken);
    if (!session) {
      throw new AppError('Invalid refresh token', 401);
    }

    const user = await userRepository.findById(session.userId);
    if (!user || !user.isActive) {
      throw new AppError('User not found or deactivated', 401);
    }

    await sessionRepository.delete(refreshToken);

    const newToken = jwtStrategy.generateToken(user);
    const newRefreshToken = jwtStrategy.generateRefreshToken(user);
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await sessionRepository.create(user.id, newRefreshToken, expiresAt);

    return {
      user: toUserResponse(user),
      token: newToken,
      refreshToken: newRefreshToken,
    };
  }

  async verifyToken(token: string): Promise<UserModel> {
    return jwtStrategy.verify(token);
  }

  async verifyApiKey(key: string): Promise<{ user: UserModel; apiKey: ApiKey }> {
    const apiKey = await apiKeyStrategy.verify(key);
    const user = await userRepository.findById(apiKey.userId);
    
    if (!user) {
      throw new AppError('User not found', 401);
    }

    return { user, apiKey };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError('Current password is incorrect', 401);
    }

    await userRepository.updatePassword(userId, newPassword);
  }

  async generateApiKey(userId: string, name: string, permissions: string[], expiresAt?: Date): Promise<{ key: string; apiKey: ApiKey }> {
    return apiKeyStrategy.generate(userId, name, permissions, expiresAt);
  }

  async revokeApiKey(id: string, userId: string): Promise<void> {
    return apiKeyStrategy.revoke(id, userId);
  }

  async listApiKeys(userId: string): Promise<ApiKey[]> {
    return apiKeyStrategy.list(userId);
  }
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const authService = new AuthService();
