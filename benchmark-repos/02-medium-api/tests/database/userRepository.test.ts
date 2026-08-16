import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRepository } from '../../src/database/repositories/userRepository.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('UserRepository', () => {
  let repo: UserRepository;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    repo = new UserRepository(mockEventBus);
  });

  describe('create', () => {
    it('should create user record', async () => {
      const user = await repo.create({ email: 'test@example.com', name: 'Test' });
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
    });
  });

  describe('findById', () => {
    it('should find user by id', async () => {
      const created = await repo.create({ email: 'test@example.com', name: 'Test' });
      const found = await repo.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should return null for non-existent user', async () => {
      const found = await repo.findById('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      await repo.create({ email: 'test@example.com', name: 'Test' });
      const found = await repo.findByEmail('test@example.com');
      expect(found).toBeDefined();
      expect(found!.email).toBe('test@example.com');
    });
  });

  describe('update', () => {
    it('should update user', async () => {
      const created = await repo.create({ email: 'test@example.com', name: 'Test' });
      const updated = await repo.update(created.id, { name: 'Updated' });
      expect(updated.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('should delete user', async () => {
      const created = await repo.create({ email: 'test@example.com', name: 'Test' });
      await repo.delete(created.id);
      const found = await repo.findById(created.id);
      expect(found).toBeNull();
    });
  });
});
