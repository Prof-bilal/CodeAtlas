import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskService } from '../src/services/taskService.js';
import { taskRepository } from '../src/repositories/taskRepository.js';
import { tagRepository } from '../src/repositories/tagRepository.js';
import { AppError } from '../src/services/authService.js';

vi.mock('../src/repositories/taskRepository.js');
vi.mock('../src/repositories/tagRepository.js');

describe('TaskService', () => {
  let taskService: TaskService;

  beforeEach(() => {
    taskService = new TaskService();
    vi.clearAllMocks();
    vi.mocked(tagRepository.getTagsForTask).mockResolvedValue([]);
    vi.mocked(tagRepository.getTagsForTasks).mockResolvedValue(new Map());
  });

  const mockUserId = 'user-123';
  const mockTaskId = 'task-456';

  const mockTask = {
    id: mockTaskId,
    title: 'Test Task',
    description: 'Test Description',
    status: 'pending' as const,
    priority: 'medium' as const,
    dueDate: new Date('2024-12-31'),
    userId: mockUserId,
    assignedTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('create', () => {
    it('should create a task successfully', async () => {
      const input = {
        title: 'New Task',
        description: 'New Description',
        priority: 'high' as const,
      };

      vi.mocked(taskRepository.create).mockResolvedValue({
        ...mockTask,
        ...input,
      });

      const result = await taskService.create(input, mockUserId);

      expect(result.title).toBe(input.title);
      expect(result.description).toBe(input.description);
      expect(result.priority).toBe(input.priority);
      expect(taskRepository.create).toHaveBeenCalledWith(input, mockUserId);
    });

    it('should throw AppError with 400 when title is empty string', async () => {
      await expect(
        taskService.create({ title: '' }, mockUserId)
      ).rejects.toThrow(AppError);
      await expect(
        taskService.create({ title: '' }, mockUserId)
      ).rejects.toThrow('Title is required');
      expect(taskRepository.create).not.toHaveBeenCalled();
    });

    it('should throw AppError with 400 when title is whitespace only', async () => {
      await expect(
        taskService.create({ title: '   ' }, mockUserId)
      ).rejects.toThrow(AppError);
      await expect(
        taskService.create({ title: '   ' }, mockUserId)
      ).rejects.toThrow('Title is required');
      expect(taskRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return a task when found', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue(mockTask);

      const result = await taskService.findById(mockTaskId, mockUserId);

      expect(result.id).toBe(mockTaskId);
      expect(result.title).toBe(mockTask.title);
    });

    it('should throw error when task not found', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue(null);

      await expect(taskService.findById('nonexistent', mockUserId)).rejects.toThrow(AppError);
      await expect(taskService.findById('nonexistent', mockUserId)).rejects.toThrow('Task not found');
    });

    it('should throw error when user does not own the task', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue({
        ...mockTask,
        userId: 'other-user',
      });

      await expect(taskService.findById(mockTaskId, mockUserId)).rejects.toThrow(AppError);
      await expect(taskService.findById(mockTaskId, mockUserId)).rejects.toThrow('Access denied');
    });
  });

  describe('update', () => {
    it('should update a task successfully', async () => {
      const updateInput = {
        title: 'Updated Task',
        status: 'in_progress' as const,
      };

      vi.mocked(taskRepository.findById).mockResolvedValue(mockTask);
      vi.mocked(taskRepository.update).mockResolvedValue({
        ...mockTask,
        ...updateInput,
      });

      const result = await taskService.update(mockTaskId, updateInput, mockUserId);

      expect(result.title).toBe(updateInput.title);
      expect(result.status).toBe(updateInput.status);
    });

    it('should throw error when task not found', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue(null);

      await expect(
        taskService.update('nonexistent', { title: 'Updated' }, mockUserId)
      ).rejects.toThrow('Task not found');
    });

    it('should throw error when user does not own the task', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue({
        ...mockTask,
        userId: 'other-user',
      });

      await expect(
        taskService.update(mockTaskId, { title: 'Updated' }, mockUserId)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('delete', () => {
    it('should delete a task successfully', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue(mockTask);
      vi.mocked(taskRepository.delete).mockResolvedValue(true);

      await taskService.delete(mockTaskId, mockUserId);

      expect(taskRepository.delete).toHaveBeenCalledWith(mockTaskId);
    });

    it('should throw error when task not found', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue(null);

      await expect(taskService.delete('nonexistent', mockUserId)).rejects.toThrow('Task not found');
    });

    it('should throw error when user does not own the task', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue({
        ...mockTask,
        userId: 'other-user',
      });

      await expect(taskService.delete(mockTaskId, mockUserId)).rejects.toThrow('Access denied');
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks', async () => {
      const tasks = [mockTask];
      vi.mocked(taskRepository.findByUser).mockResolvedValue(tasks);
      vi.mocked(taskRepository.countByUser).mockResolvedValue(1);

      const result = await taskService.findAll(mockUserId, {}, { page: 1, limit: 20, offset: 0 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it('should apply filters', async () => {
      vi.mocked(taskRepository.findByUser).mockResolvedValue([]);
      vi.mocked(taskRepository.countByUser).mockResolvedValue(0);

      await taskService.findAll(mockUserId, { status: 'pending', priority: 'high' }, { page: 1, limit: 20, offset: 0 });

      expect(taskRepository.findByUser).toHaveBeenCalledWith(
        mockUserId,
        { status: 'pending', priority: 'high' },
        20,
        0
      );
    });

    it('should compute correct offset for page 3', async () => {
      vi.mocked(taskRepository.findByUser).mockResolvedValue([]);
      vi.mocked(taskRepository.countByUser).mockResolvedValue(0);

      await taskService.findAll(mockUserId, {}, { page: 3, limit: 10, offset: 20 });

      expect(taskRepository.findByUser).toHaveBeenCalledWith(
        mockUserId,
        {},
        10,
        20
      );
    });

    it('should handle empty results', async () => {
      vi.mocked(taskRepository.findByUser).mockResolvedValue([]);
      vi.mocked(taskRepository.countByUser).mockResolvedValue(0);

      const result = await taskService.findAll(mockUserId, {}, { page: 1, limit: 20, offset: 0 });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.hasNext).toBe(false);
    });

    it('should not return tasks belonging to other users', async () => {
      const otherUserTask = {
        ...mockTask,
        id: 'task-other',
        title: 'Other User Task',
        userId: 'other-user',
      };

      vi.mocked(taskRepository.findByUser).mockResolvedValue([mockTask, otherUserTask]);
      vi.mocked(taskRepository.countByUser).mockResolvedValue(2);

      const result = await taskService.findAll(mockUserId, {}, { page: 1, limit: 20, offset: 0 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].userId).toBe(mockUserId);
    });
  });

  describe('markAsCompleted', () => {
    it('should mark task as completed', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue(mockTask);
      vi.mocked(taskRepository.update).mockResolvedValue({
        ...mockTask,
        status: 'completed',
      });

      const result = await taskService.markAsCompleted(mockTaskId, mockUserId);

      expect(result.status).toBe('completed');
    });
  });

  describe('markAsInProgress', () => {
    it('should mark task as in progress', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue(mockTask);
      vi.mocked(taskRepository.update).mockResolvedValue({
        ...mockTask,
        status: 'in_progress',
      });

      const result = await taskService.markAsInProgress(mockTaskId, mockUserId);

      expect(result.status).toBe('in_progress');
    });
  });

  describe('cancel', () => {
    it('should cancel task', async () => {
      vi.mocked(taskRepository.findById).mockResolvedValue(mockTask);
      vi.mocked(taskRepository.update).mockResolvedValue({
        ...mockTask,
        status: 'cancelled',
      });

      const result = await taskService.cancel(mockTaskId, mockUserId);

      expect(result.status).toBe('cancelled');
    });
  });

  describe('getStats', () => {
    it('should return task statistics', async () => {
      const stats = {
        total: 10,
        pending: 3,
        inProgress: 2,
        completed: 4,
        cancelled: 1,
      };

      vi.mocked(taskRepository.getTaskStats).mockResolvedValue(stats);

      const result = await taskService.getStats(mockUserId);

      expect(result).toEqual(stats);
    });
  });
});
