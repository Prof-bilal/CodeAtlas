import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService, AppError } from '../src/services/authService.js';
import { userRepository } from '../src/repositories/userRepository.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { authenticate } from '../src/middleware/auth.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

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

  describe('logout revocation', () => {
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

    it('should revoke token so verifyToken rejects it after logout', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: mockUser.id } as any);
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(sessionRepository.deleteByUserId).mockResolvedValue(0);

      const token = 'test-jwt-token';
      await authService.verifyToken(token);
      await authService.logout(token, mockUser.id);

      await expect(authService.verifyToken(token)).rejects.toThrow('Token has been revoked');
    });

    it('should revoke token so authenticate middleware rejects on protected paths', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: mockUser.id } as any);
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(sessionRepository.deleteByUserId).mockResolvedValue(0);

      const token = 'test-jwt-token-protect';
      await authService.verifyToken(token);
      await authService.logout(token, mockUser.id);

      const protectedPaths = [
        { method: 'GET', path: '/api/auth/me' },
        { method: 'POST', path: '/api/auth/change-password' },
        { method: 'POST', path: '/api/auth/logout' },
        { method: 'GET', path: '/api/tasks' },
        { method: 'GET', path: '/api/tasks/stats' },
        { method: 'GET', path: '/api/tasks/overdue' },
        { method: 'GET', path: '/api/tasks/some-id' },
        { method: 'POST', path: '/api/tasks' },
        { method: 'PUT', path: '/api/tasks/some-id' },
        { method: 'DELETE', path: '/api/tasks/some-id' },
        { method: 'PATCH', path: '/api/tasks/some-id/complete' },
        { method: 'PATCH', path: '/api/tasks/some-id/start' },
        { method: 'PATCH', path: '/api/tasks/some-id/cancel' },
        { method: 'PATCH', path: '/api/tasks/some-id/assign' },
        { method: 'GET', path: '/api/tags' },
        { method: 'GET', path: '/api/tags/some-id' },
        { method: 'POST', path: '/api/tags' },
        { method: 'PUT', path: '/api/tags/some-id' },
        { method: 'DELETE', path: '/api/tags/some-id' },
        { method: 'POST', path: '/api/tags/tasks/some-task-id' },
        { method: 'POST', path: '/api/tags/tasks/some-task-id/some-tag-id' },
        { method: 'DELETE', path: '/api/tags/tasks/some-task-id/some-tag-id' },
      ];

      for (const { path } of protectedPaths) {
        const req = {
          headers: { authorization: `Bearer ${token}` },
          params: {},
        } as unknown as Request;
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
        } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
      }
    });

    it('should delete all DB sessions for the user on logout so refresh token is invalidated', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: mockUser.id } as any);
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(sessionRepository.deleteByUserId).mockResolvedValue(2);

      await authService.logout('jwt-token-to-revoke', mockUser.id);

      expect(sessionRepository.deleteByUserId).toHaveBeenCalledWith(mockUser.id);
    });

    it('should reject the old JWT on every protected path after logout, and refresh token is gone', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: mockUser.id } as any);
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(sessionRepository.deleteByUserId).mockResolvedValue(1);

      const token = 'full-flow-jwt';
      await authService.verifyToken(token);
      await authService.logout(token, mockUser.id);

      const protectedPaths = [
        { method: 'GET', path: '/api/auth/me' },
        { method: 'POST', path: '/api/auth/change-password' },
        { method: 'POST', path: '/api/auth/logout' },
        { method: 'GET', path: '/api/tasks' },
        { method: 'GET', path: '/api/tasks/stats' },
        { method: 'GET', path: '/api/tasks/overdue' },
        { method: 'GET', path: '/api/tasks/some-id' },
        { method: 'POST', path: '/api/tasks' },
        { method: 'PUT', path: '/api/tasks/some-id' },
        { method: 'DELETE', path: '/api/tasks/some-id' },
        { method: 'PATCH', path: '/api/tasks/some-id/complete' },
        { method: 'PATCH', path: '/api/tasks/some-id/start' },
        { method: 'PATCH', path: '/api/tasks/some-id/cancel' },
        { method: 'PATCH', path: '/api/tasks/some-id/assign' },
        { method: 'GET', path: '/api/tags' },
        { method: 'GET', path: '/api/tags/some-id' },
        { method: 'POST', path: '/api/tags' },
        { method: 'PUT', path: '/api/tags/some-id' },
        { method: 'DELETE', path: '/api/tags/some-id' },
        { method: 'POST', path: '/api/tags/tasks/some-task-id' },
        { method: 'POST', path: '/api/tags/tasks/some-task-id/some-tag-id' },
        { method: 'DELETE', path: '/api/tags/tasks/some-task-id/some-tag-id' },
      ];

      for (const { method, path } of protectedPaths) {
        const req = {
          headers: { authorization: `Bearer ${token}` },
          params: { id: 'some-id', taskId: 'some-task-id', tagId: 'some-tag-id' },
        } as unknown as Request;
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
        } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
      }

      expect(sessionRepository.deleteByUserId).toHaveBeenCalledWith(mockUser.id);
    });

    it('should revoke ALL tokens for the user on logout, not just the one used to log out', async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: mockUser.id } as any);
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(sessionRepository.deleteByUserId).mockResolvedValue(0);

      const tokenDeviceA = 'jwt-device-a';
      const tokenDeviceB = 'jwt-device-b';

      await authService.verifyToken(tokenDeviceA);
      await authService.verifyToken(tokenDeviceB);

      await authService.logout(tokenDeviceA, mockUser.id);

      const protectedPaths = [
        { method: 'GET', path: '/api/auth/me' },
        { method: 'POST', path: '/api/auth/change-password' },
        { method: 'POST', path: '/api/auth/logout' },
        { method: 'GET', path: '/api/tasks' },
        { method: 'GET', path: '/api/tasks/stats' },
        { method: 'GET', path: '/api/tasks/overdue' },
        { method: 'GET', path: '/api/tasks/some-id' },
        { method: 'POST', path: '/api/tasks' },
        { method: 'PUT', path: '/api/tasks/some-id' },
        { method: 'DELETE', path: '/api/tasks/some-id' },
        { method: 'PATCH', path: '/api/tasks/some-id/complete' },
        { method: 'PATCH', path: '/api/tasks/some-id/start' },
        { method: 'PATCH', path: '/api/tasks/some-id/cancel' },
        { method: 'PATCH', path: '/api/tasks/some-id/assign' },
        { method: 'GET', path: '/api/tags' },
        { method: 'GET', path: '/api/tags/some-id' },
        { method: 'POST', path: '/api/tags' },
        { method: 'PUT', path: '/api/tags/some-id' },
        { method: 'DELETE', path: '/api/tags/some-id' },
        { method: 'POST', path: '/api/tags/tasks/some-task-id' },
        { method: 'POST', path: '/api/tags/tasks/some-task-id/some-tag-id' },
        { method: 'DELETE', path: '/api/tags/tasks/some-task-id/some-tag-id' },
      ];

      for (const { path } of protectedPaths) {
        for (const token of [tokenDeviceA, tokenDeviceB]) {
          const req = {
            headers: { authorization: `Bearer ${token}` },
            params: { id: 'some-id', taskId: 'some-task-id', tagId: 'some-tag-id' },
          } as unknown as Request;
          const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
          } as unknown as Response;
          const next = vi.fn() as NextFunction;

          await authenticate(req, res, next);

          expect(res.status).toHaveBeenCalledWith(401);
          expect(next).not.toHaveBeenCalled();
        }
      }
    });

    it('should reject a token revoked during the verifyToken async gap (race condition)', async () => {
      let resolveFindById: (value: typeof mockUser) => void;
      const findByIdDeferred = new Promise<typeof mockUser>((resolve) => {
        resolveFindById = resolve;
      });

      vi.mocked(jwt.verify).mockReturnValue({ userId: mockUser.id } as any);
      vi.mocked(userRepository.findById).mockReturnValue(findByIdDeferred as any);
      vi.mocked(sessionRepository.deleteByUserId).mockResolvedValue(0);

      const token = 'race-condition-jwt';

      const verifyPromise = authService.verifyToken(token);

      await authService.logout(token, mockUser.id);

      resolveFindById!(mockUser);

      await expect(verifyPromise).rejects.toThrow('Token has been revoked');
    });
  });
});
