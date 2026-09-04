import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../src/services/userService.js';
import { userRepository } from '../src/repositories/userRepository.js';
import { AppError } from '../src/services/authService.js';

vi.mock('../src/repositories/userRepository.js');

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'John',
    lastName: 'Doe',
    role: 'user' as const,
    isActive: true,
    emailVerified: true,
    stripeCustomerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('create', () => {
    it('should create a user successfully', async () => {
      const input = {
        email: 'test@example.com',
        password: 'Password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(userRepository.create).mockResolvedValue(mockUser);

      const result = await userService.create(input);

      expect(result.email).toBe(input.email);
      expect(result.firstName).toBe(input.firstName);
    });

    it('should throw error if email already exists', async () => {
      const input = {
        email: 'existing@example.com',
        password: 'Password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);

      await expect(userService.create(input)).rejects.toThrow(AppError);
      await expect(userService.create(input)).rejects.toThrow('Email already registered');
    });
  });

  describe('findById', () => {
    it('should return a user when found', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);

      const result = await userService.findById('user-123');

      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
    });

    it('should throw error when user not found', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(userService.findById('nonexistent')).rejects.toThrow(AppError);
      await expect(userService.findById('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('update', () => {
    it('should update a user successfully', async () => {
      const updateInput = {
        firstName: 'Jane',
        lastName: 'Smith',
      };

      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(userRepository.update).mockResolvedValue({
        ...mockUser,
        ...updateInput,
      });

      const result = await userService.update('user-123', updateInput);

      expect(result.firstName).toBe(updateInput.firstName);
      expect(result.lastName).toBe(updateInput.lastName);
    });

    it('should throw error when user not found', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(
        userService.update('nonexistent', { firstName: 'Jane' })
      ).rejects.toThrow('User not found');
    });

    it('should throw error when email already in use', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(userRepository.emailExists).mockResolvedValue(true);

      await expect(
        userService.update('user-123', { email: 'taken@example.com' })
      ).rejects.toThrow('Email already in use');
    });
  });

  describe('delete', () => {
    it('should delete a user successfully', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(userRepository.delete).mockResolvedValue(true);

      await userService.delete('user-123');

      expect(userRepository.delete).toHaveBeenCalledWith('user-123');
    });

    it('should throw error when user not found', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(userService.delete('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const users = [mockUser];
      vi.mocked(userRepository.findAll).mockResolvedValue(users);

      const result = await userService.findAll(20, 0);

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe(mockUser.email);
    });
  });

  describe('getStats', () => {
    it('should return user statistics', async () => {
      vi.mocked(userRepository.count).mockResolvedValue(10);
      vi.mocked(userRepository.countByStatus).mockResolvedValue(8);
      vi.mocked(userRepository.countByRole).mockResolvedValue(2);

      const result = await userService.getStats();

      expect(result.total).toBe(10);
      expect(result.active).toBe(8);
      expect(result.inactive).toBe(2);
      expect(result.admins).toBe(2);
    });
  });
});
