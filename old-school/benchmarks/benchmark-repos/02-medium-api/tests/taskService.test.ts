import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskServiceImpl } from '../src/services/taskService.js';
import { TaskRepository } from '../src/database/repositories/taskRepository.js';
import { eventBus } from '../src/events/eventBus.js';

vi.mock('../src/database/repositories/taskRepository.js');
vi.mock('../src/events/eventBus.js');

describe('TaskServiceImpl', () => {
  let service: TaskServiceImpl;
  let mockTaskRepository: any;

  beforeEach(() => {
    service = new TaskServiceImpl();
    mockTaskRepository = vi.mocked(TaskRepository.prototype);
    vi.clearAllMocks();
  });

  describe('getTask', () => {
    it('should return task if found', async () => {
      const mockTask = { id: 'task-1', title: 'Test Task' };
      mockTaskRepository.findById.mockResolvedValue(mockTask);

      const result = await service.getTask('task-1');
      expect(result).toEqual(mockTask);
    });

    it('should throw error if task not found', async () => {
      mockTaskRepository.findById.mockResolvedValue(null);

      await expect(service.getTask('task-1')).rejects.toThrow('Task not found');
    });
  });

  describe('createTask', () => {
    it('should create task successfully', async () => {
      const mockTask = { id: 'task-1', title: 'Test Task', userId: 'user-1' };
      mockTaskRepository.create.mockResolvedValue(mockTask);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.createTask({
        title: 'Test Task',
        userId: 'user-1',
      });

      expect(result).toEqual(mockTask);
      expect(mockTaskRepository.create).toHaveBeenCalled();
    });
  });

  describe('completeTask', () => {
    it('should complete task successfully', async () => {
      const mockTask = { id: 'task-1', title: 'Test Task', userId: 'user-1' };
      mockTaskRepository.findById.mockResolvedValue(mockTask);
      mockTaskRepository.update.mockResolvedValue({ ...mockTask, status: 'completed' });
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.completeTask('task-1');
      expect(result.status).toBe('completed');
    });
  });

  describe('assignTask', () => {
    it('should assign task successfully', async () => {
      const mockTask = { id: 'task-1', title: 'Test Task', userId: 'user-1' };
      mockTaskRepository.findById.mockResolvedValue(mockTask);
      mockTaskRepository.update.mockResolvedValue({ ...mockTask, assignedTo: 'user-2' });
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.assignTask('task-1', 'user-2');
      expect(result.assignedTo).toBe('user-2');
    });
  });
});
