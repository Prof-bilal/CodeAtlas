import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskService } from '../../src/services/taskService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('TaskService', () => {
  let taskService: TaskService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    taskService = new TaskService(mockEventBus);
  });

  describe('createTask', () => {
    it('should create task', async () => {
      const task = await taskService.createTask({ title: 'Test', userId: 'user-1' });
      expect(task.id).toBeDefined();
      expect(task.status).toBe('pending');
    });
  });

  describe('completeTask', () => {
    it('should complete task', async () => {
      const task = await taskService.createTask({ title: 'Test', userId: 'user-1' });
      const completed = await taskService.completeTask(task.id);
      expect(completed.status).toBe('completed');
    });
  });
});
