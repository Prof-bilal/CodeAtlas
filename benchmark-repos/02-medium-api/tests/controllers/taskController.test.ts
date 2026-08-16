import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskController } from '../../src/controllers/taskControllerV2.js';
import { TaskService } from '../../src/core/tasks/taskService.js';

vi.mock('../../src/core/tasks/taskService.js');

describe('TaskController', () => {
  let taskController: TaskController;
  let mockTaskService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskService = {
      getTasksByUser: vi.fn(),
      getTask: vi.fn(),
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      completeTask: vi.fn(),
      assignTask: vi.fn(),
      addComment: vi.fn(),
      getComments: vi.fn(),
      getTaskStats: vi.fn(),
    };
    vi.mocked(TaskService).mockImplementation(() => mockTaskService);
    taskController = new TaskController();
    mockReq = { body: {}, params: {}, query: {}, user: { id: 'user-1' } } as any;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as any;
  });

  describe('getTasks', () => {
    it('should return tasks', async () => {
      mockTaskService.getTasksByUser.mockResolvedValue([{ id: 't1', title: 'Test' }]);
      await taskController.getTasks(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith([{ id: 't1', title: 'Test' }]);
    });
  });

  describe('createTask', () => {
    it('should create task', async () => {
      mockReq.body = { title: 'New Task' };
      mockTaskService.createTask.mockResolvedValue({ id: 't1', title: 'New Task' });
      await taskController.createTask(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });

  describe('deleteTask', () => {
    it('should delete task', async () => {
      mockReq.params = { id: 't1' };
      mockTaskService.deleteTask.mockResolvedValue(undefined);
      await taskController.deleteTask(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(204);
    });
  });
});
