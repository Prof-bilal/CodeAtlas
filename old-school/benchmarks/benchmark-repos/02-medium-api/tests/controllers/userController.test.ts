import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserController } from '../../src/controllers/userControllerV2.js';
import { UserService } from '../../src/core/users/userServiceV2.js';

vi.mock('../../src/core/users/userServiceV2.js');

describe('UserController', () => {
  let userController: UserController;
  let mockUserService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserService = {
      getUser: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
      getAllUsers: vi.fn(),
      updateUserRole: vi.fn(),
      updateUserStatus: vi.fn(),
      changePassword: vi.fn(),
    };
    vi.mocked(UserService).mockImplementation(() => mockUserService);
    userController = new UserController();
    mockReq = { body: {}, params: {}, query: {}, user: { id: 'user-1' } } as any;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as any;
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      mockUserService.getUser.mockResolvedValue({ id: 'user-1', name: 'Test' });
      await userController.getProfile(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ id: 'user-1', name: 'Test' });
    });
  });

  describe('updateProfile', () => {
    it('should update user', async () => {
      mockReq.body = { name: 'Updated' };
      mockUserService.updateUser.mockResolvedValue({ id: 'user-1', name: 'Updated' });
      await userController.updateProfile(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ id: 'user-1', name: 'Updated' });
    });
  });

  describe('deleteProfile', () => {
    it('should delete user', async () => {
      mockUserService.deleteUser.mockResolvedValue(undefined);
      await userController.deleteProfile(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(204);
    });
  });
});
