import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from '../../src/controllers/authControllerV2.js';
import { UserService } from '../../src/core/users/userServiceV2.js';
import { Request, Response } from 'express';

vi.mock('../../src/core/users/userServiceV2.js');

describe('AuthController', () => {
  let authController: AuthController;
  let mockUserService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserService = {
      createUser: vi.fn(),
      authenticate: vi.fn(),
      refreshToken: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      verifyEmail: vi.fn(),
    };
    vi.mocked(UserService).mockImplementation(() => mockUserService);
    authController = new AuthController();
    mockReq = { body: {}, user: { id: 'user-1' } } as any;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
  });

  describe('register', () => {
    it('should create user and return 201', async () => {
      mockReq.body = { email: 'test@example.com', name: 'Test', password: 'Pass123' };
      mockUserService.createUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ user: { id: 'user-1', email: 'test@example.com' } });
    });
  });

  describe('login', () => {
    it('should return token', async () => {
      mockReq.body = { email: 'test@example.com', password: 'Pass123' };
      mockUserService.authenticate.mockResolvedValue({ user: { id: 'user-1' }, token: 'jwt-token' });

      await authController.login(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ user: { id: 'user-1' }, token: 'jwt-token' });
    });
  });
});
