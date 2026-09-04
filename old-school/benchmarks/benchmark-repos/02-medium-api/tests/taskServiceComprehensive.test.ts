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

  describe('getTasksByUser', () => {
    it('should return tasks for user', async () => {
      const mockTasks = [{ id: 'task-1' }, { id: 'task-2' }];
      mockTaskRepository.findByUserId.mockResolvedValue(mockTasks);

      const result = await service.getTasksByUser('user-1');
      expect(result).toEqual(mockTasks);
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

  describe('updateTask', () => {
    it('should update task successfully', async () => {
      const mockTask = { id: 'task-1', title: 'Test Task', userId: 'user-1' };
      mockTaskRepository.findById.mockResolvedValue(mockTask);
      mockTaskRepository.update.mockResolvedValue({ ...mockTask, title: 'Updated Task' });
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.updateTask('task-1', { title: 'Updated Task' });
      expect(result.title).toBe('Updated Task');
    });

    it('should throw error if task not found', async () => {
      mockTaskRepository.findById.mockResolvedValue(null);

      await expect(service.updateTask('task-1', { title: 'Updated Task' })).rejects.toThrow('Task not found');
    });
  });

  describe('deleteTask', () => {
    it('should delete task successfully', async () => {
      const mockTask = { id: 'task-1' };
      mockTaskRepository.findById.mockResolvedValue(mockTask);
      mockTaskRepository.delete.mockResolvedValue(true);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.deleteTask('task-1');
      expect(result).toBe(true);
    });

    it('should throw error if task not found', async () => {
      mockTaskRepository.findById.mockResolvedValue(null);

      await expect(service.deleteTask('task-1')).rejects.toThrow('Task not found');
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

  describe('getOverdueTasks', () => {
    it('should return overdue tasks', async () => {
      const mockTasks = [{ id: 'task-1', dueDate: new Date('2024-01-01') }];
      mockTaskRepository.findOverdue.mockResolvedValue(mockTasks);

      const result = await service.getOverdueTasks();
      expect(result).toEqual(mockTasks);
    });
  });
});
