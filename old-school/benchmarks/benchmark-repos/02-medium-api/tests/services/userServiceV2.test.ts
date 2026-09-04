import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../../src/core/users/userService.js';
import { UserRepository } from '../../src/database/repositories/userRepository.js';
import { EventBus } from '../../src/events/eventBus.js';
import { cacheService } from '../../src/services/cacheService.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

vi.mock('../../src/database/repositories/userRepository.js');
vi.mock('../../src/events/eventBus.js');
vi.mock('../../src/services/cacheService.js');

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: any;
  let mockEventBus: any;
  let mockCacheService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRepository = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
    };
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    userService = new UserService(mockUserRepository, mockEventBus, mockCacheService);
  });

  describe('createUser', () => {
    it('should hash password and create user', async () => {
      const userData = { email: 'test@example.com', name: 'Test User', password: 'Password123' };
      const mockUser = { id: 'user-1', ...userData, createdAt: new Date() };
      mockUserRepository.create.mockResolvedValue(mockUser);

      const result = await userService.createUser(userData);

      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith('user:created', { user: mockUser });
    });
  });

  describe('authenticate', () => {
    it('should authenticate valid credentials', async () => {
      const email = 'test@example.com';
      const password = 'Password123';
      const mockUser = { id: 'user-1', email, password: await bcrypt.hash(password, 10) };
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      const result = await userService.authenticate(email, password);

      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
    });

    it('should throw for invalid credentials', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(userService.authenticate('test@example.com', 'wrong')).rejects.toThrow('Invalid credentials');
    });
  });
});
