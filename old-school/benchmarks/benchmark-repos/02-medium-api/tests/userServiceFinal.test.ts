import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserServiceImpl } from '../src/services/userService.js';
import { UserRepository } from '../src/database/repositories/userRepository.js';
import { hashPassword, comparePassword } from '../src/auth/password.js';
import { generateToken, verifyToken } from '../src/auth/jwt.js';
import { eventBus } from '../src/events/eventBus.js';

vi.mock('../src/database/repositories/userRepository.js');
vi.mock('../src/auth/password.js');
vi.mock('../src/auth/jwt.js');
vi.mock('../src/events/eventBus.js');

describe('UserServiceImpl', () => {
  let service: UserServiceImpl;
  let mockUserRepository: any;

  beforeEach(() => {
    service = new UserServiceImpl();
    mockUserRepository = vi.mocked(UserRepository.prototype);
    vi.clearAllMocks();
  });

  describe('getUser', () => {
    it('should return user if found', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await service.getUser('user-1');
      expect(result).toEqual(mockUser);
    });

    it('should throw error if user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(service.getUser('user-1')).rejects.toThrow('User not found');
    });
  });

  describe('createUser', () => {
    it('should create user successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue(mockUser);
      vi.mocked(hashPassword).mockResolvedValue('hashed-password');
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.createUser({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.create).toHaveBeenCalled();
    });

    it('should throw error if email already exists', async () => {
      const existingUser = { id: 'existing-user', email: 'test@example.com' };
      mockUserRepository.findByEmail.mockResolvedValue(existingUser);

      await expect(service.createUser({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      })).rejects.toThrow('Email already exists');
    });
  });

  describe('authenticate', () => {
    it('should authenticate user successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', passwordHash: 'hashed-password' };
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      vi.mocked(comparePassword).mockResolvedValue(true);
      vi.mocked(generateToken).mockReturnValue('jwt-token');
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.authenticate('test@example.com', 'password123');
      expect(result.user).toEqual(mockUser);
      expect(result.token).toBe('jwt-token');
    });

    it('should throw error for invalid credentials', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(service.authenticate('test@example.com', 'wrong-password')).rejects.toThrow('Invalid credentials');
    });
  });
});
