import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../../src/core/users/userServiceV2.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('UserService (V2)', () => {
  let userService: UserService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    userService = new UserService(mockEventBus);
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const userData = { email: 'test@example.com', name: 'Test User', password: 'Password123' };
      const result = await userService.createUser(userData);

      expect(result.id).toBeDefined();
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
      expect(mockEventBus.emit).toHaveBeenCalledWith('user:created', { user: result });
    });

    it('should reject duplicate email', async () => {
      await userService.createUser({ email: 'test@example.com', name: 'Test', password: 'Pass123' });
      await expect(userService.createUser({ email: 'test@example.com', name: 'Test2', password: 'Pass123' }))
        .rejects.toThrow('Email already exists');
    });
  });

  describe('getUser', () => {
    it('should return user by id', async () => {
      const user = await userService.createUser({ email: 'test@example.com', name: 'Test', password: 'Pass123' });
      const result = await userService.getUser(user.id);
      expect(result.id).toBe(user.id);
    });

    it('should throw for non-existent user', async () => {
      await expect(userService.getUser('non-existent')).rejects.toThrow('User not found');
    });
  });

  describe('updateUser', () => {
    it('should update user data', async () => {
      const user = await userService.createUser({ email: 'test@example.com', name: 'Test', password: 'Pass123' });
      const updated = await userService.updateUser(user.id, { name: 'Updated Name' });
      expect(updated.name).toBe('Updated Name');
    });
  });

  describe('deleteUser', () => {
    it('should delete user', async () => {
      const user = await userService.createUser({ email: 'test@example.com', name: 'Test', password: 'Pass123' });
      await userService.deleteUser(user.id);
      await expect(userService.getUser(user.id)).rejects.toThrow('User not found');
    });
  });

  describe('changePassword', () => {
    it('should change password with correct current', async () => {
      const user = await userService.createUser({ email: 'test@example.com', name: 'Test', password: 'Password123' });
      await expect(userService.changePassword(user.id, 'Password123', 'NewPass456')).resolves.toBeUndefined();
    });

    it('should reject incorrect current password', async () => {
      const user = await userService.createUser({ email: 'test@example.com', name: 'Test', password: 'Password123' });
      await expect(userService.changePassword(user.id, 'WrongPass', 'NewPass456'))
        .rejects.toThrow('Current password is incorrect');
    });
  });

  describe('forgotPassword', () => {
    it('should emit reset event for existing user', async () => {
      const user = await userService.createUser({ email: 'test@example.com', name: 'Test', password: 'Pass123' });
      await userService.forgotPassword('test@example.com');
      expect(mockEventBus.emit).toHaveBeenCalledWith('user:password:reset', expect.any(Object));
    });

    it('should silently fail for non-existent user', async () => {
      await userService.forgotPassword('nonexistent@example.com');
      expect(mockEventBus.emit).not.toHaveBeenCalledWith('user:password:reset', expect.any(Object));
    });
  });
});
