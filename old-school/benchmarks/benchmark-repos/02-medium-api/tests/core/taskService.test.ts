import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskService } from '../../src/core/tasks/taskService.js';
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
    it('should create a new task', async () => {
      const taskData = { title: 'Test Task', userId: 'user-1', description: 'Test desc' };
      const result = await taskService.createTask(taskData);

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Test Task');
      expect(result.status).toBe('pending');
      expect(mockEventBus.emit).toHaveBeenCalledWith('task:created', { task: result });
    });
  });

  describe('getTask', () => {
    it('should return task by id', async () => {
      const task = await taskService.createTask({ title: 'Test', userId: 'user-1' });
      const result = await taskService.getTask(task.id);
      expect(result.id).toBe(task.id);
    });

    it('should throw for non-existent task', async () => {
      await expect(taskService.getTask('non-existent')).rejects.toThrow('Task not found');
    });
  });

  describe('updateTask', () => {
    it('should update task fields', async () => {
      const task = await taskService.createTask({ title: 'Original', userId: 'user-1' });
      const updated = await taskService.updateTask(task.id, { title: 'Updated', priority: 5 });
      expect(updated.title).toBe('Updated');
      expect(updated.priority).toBe(5);
    });
  });

  describe('completeTask', () => {
    it('should mark task as completed', async () => {
      const task = await taskService.createTask({ title: 'Test', userId: 'user-1' });
      const completed = await taskService.completeTask(task.id);
      expect(completed.status).toBe('completed');
      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed', { task: completed });
    });
  });

  describe('assignTask', () => {
    it('should assign task to user', async () => {
      const task = await taskService.createTask({ title: 'Test', userId: 'user-1' });
      const assigned = await taskService.assignTask(task.id, 'user-2');
      expect(assigned.assignedTo).toBe('user-2');
      expect(mockEventBus.emit).toHaveBeenCalledWith('task:assigned', expect.any(Object));
    });
  });

  describe('deleteTask', () => {
    it('should delete task', async () => {
      const task = await taskService.createTask({ title: 'Test', userId: 'user-1' });
      await taskService.deleteTask(task.id);
      await expect(taskService.getTask(task.id)).rejects.toThrow('Task not found');
    });
  });

  describe('getTasksByUser', () => {
    it('should return tasks for user', async () => {
      await taskService.createTask({ title: 'Task 1', userId: 'user-1' });
      await taskService.createTask({ title: 'Task 2', userId: 'user-1' });
      await taskService.createTask({ title: 'Task 3', userId: 'user-2' });

      const tasks = await taskService.getTasksByUser('user-1', {});
      expect(tasks).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const task = await taskService.createTask({ title: 'Task 1', userId: 'user-1' });
      await taskService.completeTask(task.id);
      await taskService.createTask({ title: 'Task 2', userId: 'user-1' });

      const completed = await taskService.getTasksByUser('user-1', { status: 'completed' });
      expect(completed).toHaveLength(1);
    });
  });

  describe('getOverdueTasks', () => {
    it('should return overdue tasks', async () => {
      await taskService.createTask({ title: 'Overdue', userId: 'user-1', dueDate: '2020-01-01' });
      await taskService.createTask({ title: 'Future', userId: 'user-1', dueDate: '2099-12-31' });

      const overdue = await taskService.getOverdueTasks();
      expect(overdue).toHaveLength(1);
      expect(overdue[0].title).toBe('Overdue');
    });
  });

  describe('getTaskStats', () => {
    it('should return correct stats', async () => {
      const task1 = await taskService.createTask({ title: 'Task 1', userId: 'user-1' });
      const task2 = await taskService.createTask({ title: 'Task 2', userId: 'user-1' });
      await taskService.completeTask(task1.id);

      const stats = await taskService.getTaskStats('user-1');
      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(1);
    });
  });
});
