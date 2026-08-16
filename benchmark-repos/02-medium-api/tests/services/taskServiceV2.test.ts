import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskService } from '../../src/core/users/taskService.js';
import { TaskRepository } from '../../src/database/repositories/taskRepository.js';
import { EventBus } from '../../src/events/eventBus.js';
import { cacheService } from '../../src/services/cacheService.js';

vi.mock('../../src/database/repositories/taskRepository.js');
vi.mock('../../src/events/eventBus.js');
vi.mock('../../src/services/cacheService.js');

describe('TaskService', () => {
  let taskService: TaskService;
  let mockTaskRepository: any;
  let mockEventBus: any;
  let mockCacheService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskRepository = {
      findByUser: vi.fn(),
      findOverdue: vi.fn(),
      getStats: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
    };
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    taskService = new TaskService(mockTaskRepository, mockEventBus, mockCacheService);
  });

  describe('getTasksByUser', () => {
    it('should return cached tasks when available', async () => {
      const userId = 'user-123';
      const mockTasks = [{ id: 'task-1', title: 'Test Task' }];
      mockCacheService.get.mockResolvedValue(mockTasks);

      const result = await taskService.getTasksByUser(userId, {});

      expect(result).toEqual(mockTasks);
      expect(mockCacheService.get).toHaveBeenCalledWith(`tasks:${userId}`);
    });

    it('should fetch from repository when cache misses', async () => {
      const userId = 'user-123';
      const mockTasks = [{ id: 'task-1', title: 'Test Task' }];
      mockCacheService.get.mockResolvedValue(null);
      mockTaskRepository.findByUser.mockResolvedValue(mockTasks);

      const result = await taskService.getTasksByUser(userId, {});

      expect(result).toEqual(mockTasks);
      expect(mockCacheService.set).toHaveBeenCalledWith(`tasks:${userId}`, mockTasks, 300);
    });
  });

  describe('createTask', () => {
    it('should create a task and emit event', async () => {
      const taskData = { title: 'New Task', userId: 'user-123' };
      const mockTask = { id: 'task-1', ...taskData, createdAt: new Date() };
      mockTaskRepository.create.mockResolvedValue(mockTask);

      const result = await taskService.createTask(taskData);

      expect(result).toEqual(mockTask);
      expect(mockEventBus.emit).toHaveBeenCalledWith('task:created', { task: mockTask });
      expect(mockCacheService.invalidate).toHaveBeenCalled();
    });
  });

  describe('completeTask', () => {
    it('should mark task as completed and emit event', async () => {
      const taskId = 'task-123';
      const mockTask = { id: taskId, status: 'completed' };
      mockTaskRepository.update.mockResolvedValue(mockTask);

      const result = await taskService.completeTask(taskId);

      expect(result).toEqual(mockTask);
      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed', { task: mockTask });
    });
  });
});
