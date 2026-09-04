import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskRepository } from '../../src/database/repositories/taskRepository.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('TaskRepository', () => {
  let repo: TaskRepository;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    repo = new TaskRepository(mockEventBus);
  });

  describe('create', () => {
    it('should create task record', async () => {
      const task = await repo.create({ title: 'Test Task', userId: 'user-1' });
      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
    });
  });

  describe('findByUser', () => {
    it('should find tasks by user', async () => {
      await repo.create({ title: 'Task 1', userId: 'user-1' });
      await repo.create({ title: 'Task 2', userId: 'user-1' });
      await repo.create({ title: 'Task 3', userId: 'user-2' });

      const tasks = await repo.findByUser('user-1');
      expect(tasks).toHaveLength(2);
    });
  });

  describe('findOverdue', () => {
    it('should find overdue tasks', async () => {
      await repo.create({ title: 'Overdue', userId: 'user-1', dueDate: new Date('2020-01-01') });
      await repo.create({ title: 'Future', userId: 'user-1', dueDate: new Date('2099-12-31') });

      const overdue = await repo.findOverdue();
      expect(overdue.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('update', () => {
    it('should update task', async () => {
      const task = await repo.create({ title: 'Original', userId: 'user-1' });
      const updated = await repo.update(task.id, { title: 'Updated', status: 'completed' });
      expect(updated.title).toBe('Updated');
      expect(updated.status).toBe('completed');
    });
  });
});
