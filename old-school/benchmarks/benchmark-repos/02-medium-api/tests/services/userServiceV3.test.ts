import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../../src/services/userService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('UserService', () => {
  let userService: UserService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    userService = new UserService(mockEventBus);
  });

  describe('createUser', () => {
    it('should create user', async () => {
      const user = await userService.createUser({ email: 'test@example.com', name: 'Test', password: 'Pass123' });
      expect(user.id).toBeDefined();
    });
  });

  describe('getUser', () => {
    it('should return user', async () => {
      const user = await userService.createUser({ email: 'test@example.com', name: 'Test', password: 'Pass123' });
      const found = await userService.getUser(user.id);
      expect(found.id).toBe(user.id);
    });
  });
});
