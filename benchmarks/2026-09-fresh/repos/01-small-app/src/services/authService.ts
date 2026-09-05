import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.js';
import { userRepository } from '../repositories/userRepository.js';
import { sessionRepository } from '../repositories/sessionRepository.js';
import { CreateUserInput, UserModel, UserResponse, toUserResponse } from '../models/user.js';

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
    const token = this.generateToken(user);
    const refreshToken = await this.createSession(user.id);

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

    const token = this.generateToken(user);
    const refreshToken = await this.createSession(user.id);

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

    const newToken = this.generateToken(user);
    const newRefreshToken = await this.createSession(user.id);

    return {
      user: toUserResponse(user),
      token: newToken,
      refreshToken: newRefreshToken,
    };
  }

  async verifyToken(token: string): Promise<UserModel> {
    try {
      const payload = jwt.verify(token, authConfig.jwtSecret) as { userId: string };
      const user = await userRepository.findById(payload.userId);
      
      if (!user) {
        throw new AppError('User not found', 401);
      }

      if (!user.isActive) {
        throw new AppError('Account is deactivated', 403);
      }

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Invalid token', 401);
    }
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

  private generateToken(user: UserModel): string {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      authConfig.jwtSecret,
      { expiresIn: authConfig.jwtExpiresIn }
    );
  }

  private async createSession(userId: string): Promise<string> {
    const token = await sessionRepository.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await sessionRepository.create(userId, token, expiresAt);
    return token;
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
