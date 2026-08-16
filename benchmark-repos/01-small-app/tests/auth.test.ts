import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService, AppError } from '../src/services/authService.js';
import { userRepository } from '../src/repositories/userRepository.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

vi.mock('../src/repositories/userRepository.js');
vi.mock('../src/repositories/sessionRepository.js');
vi.mock('bcryptjs');
vi.mock('jsonwebtoken');

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const input = {
        email: 'test@example.com',
        password: 'Password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      const mockUser = {
        id: 'user-123',
        email: input.email.toLowerCase(),
        passwordHash: 'hashed-password',
        firstName: input.firstName,
        lastName: input.lastName,
        role: 'user' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(userRepository.create).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as any);
      vi.mocked(jwt.sign).mockReturnValue('mock-jwt-token');
      vi.mocked(sessionRepository.generateToken).mockResolvedValue('refresh-token');
      vi.mocked(sessionRepository.create).mockResolvedValue({
        id: 'session-123',
        userId: mockUser.id,
        token: 'refresh-token',
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await authService.register(input);

      expect(result.user.email).toBe(input.email.toLowerCase());
      expect(result.user.firstName).toBe(input.firstName);
      expect(result.token).toBe('mock-jwt-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(userRepository.create).toHaveBeenCalledWith(input);
    });

    it('should throw error if email already exists', async () => {
      const input = {
        email: 'existing@example.com',
        password: 'Password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      vi.mocked(userRepository.findByEmail).mockResolvedValue({
        id: 'existing-user',
        email: input.email,
        passwordHash: 'hashed',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(authService.register(input)).rejects.toThrow(AppError);
      await expect(authService.register(input)).rejects.toThrow('Email already registered');
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const input = {
        email: 'test@example.com',
        password: 'Password123',
      };

      const mockUser = {
        id: 'user-123',
        email: input.email,
        passwordHash: 'hashed-password',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);
      vi.mocked(jwt.sign).mockReturnValue('mock-jwt-token');
      vi.mocked(sessionRepository.generateToken).mockResolvedValue('refresh-token');
      vi.mocked(sessionRepository.create).mockResolvedValue({
        id: 'session-123',
        userId: mockUser.id,
        token: 'refresh-token',
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await authService.login(input);

      expect(result.user.email).toBe(input.email);
      expect(result.token).toBe('mock-jwt-token');
      expect(result.refreshToken).toBe('refresh-token');
    });

    it('should throw error with invalid email', async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);

      await expect(
        authService.login({ email: 'nonexistent@example.com', password: 'Password123' })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error with invalid password', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);

      await expect(
        authService.login({ email: 'test@example.com', password: 'WrongPassword' })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error if user is deactivated', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user' as const,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);

      await expect(
        authService.login({ email: 'test@example.com', password: 'Password123' })
      ).rejects.toThrow('Account is deactivated');
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(jwt.verify).mockReturnValue({ userId: mockUser.id } as any);
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);

      const result = await authService.verifyToken('valid-token');

      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
    });

    it('should throw error for invalid token', async () => {
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.verifyToken('invalid-token')).rejects.toThrow('Invalid token');
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'old-hashed-password',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);
      vi.mocked(bcrypt.hash).mockResolvedValue('new-hashed-password' as any);
      vi.mocked(userRepository.updatePassword).mockResolvedValue(true);

      await authService.changePassword('user-123', 'OldPassword123', 'NewPassword123');

      expect(userRepository.updatePassword).toHaveBeenCalledWith('user-123', 'NewPassword123');
    });

    it('should throw error if current password is incorrect', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);

      await expect(
        authService.changePassword('user-123', 'WrongPassword', 'NewPassword123')
      ).rejects.toThrow('Current password is incorrect');
    });
  });
});
