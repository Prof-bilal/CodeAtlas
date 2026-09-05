import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../src/app.js';
import { taskRepository } from '../src/repositories/taskRepository.js';
import { tagRepository } from '../src/repositories/tagRepository.js';

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$12$hashed'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../src/repositories/taskRepository.js');
vi.mock('../src/repositories/tagRepository.js');
vi.mock('../src/repositories/userRepository.js');
vi.mock('../src/repositories/sessionRepository.js');

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: async (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  authorizeTaskOwnerOrAdmin: (_req: any, _res: any, next: any) => next(),
}));

describe('POST /api/tasks', () => {
  let app: express.Application;

  const mockTask = {
    id: 'task-456',
    title: 'Test Task',
    description: 'Test Description',
    status: 'pending' as const,
    priority: 'medium' as const,
    dueDate: new Date('2024-12-31'),
    userId: 'user-123',
    assignedTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tagRepository.getTagsForTask).mockResolvedValue([]);
    vi.mocked(tagRepository.getTagsForTasks).mockResolvedValue(new Map());

    app = createApp();
  });

  it('should reject empty title with 400 and a title-specific error', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '', description: 'Some description' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0].msg).toMatch(/title/i);
    expect(res.body.id).toBeUndefined();
  });

  it('should reject missing title with 400 and a title-specific error', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ description: 'Some description' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0].msg).toMatch(/title/i);
    expect(res.body.id).toBeUndefined();
  });

  it('should reject whitespace-only title with 400 and a title-specific error', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0].msg).toMatch(/title/i);
    expect(res.body.id).toBeUndefined();
  });

  it('should create a task with valid title and return it with an id', async () => {
    vi.mocked(taskRepository.create).mockResolvedValue(mockTask);

    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'New Task', description: 'A valid task' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('task-456');
    expect(typeof res.body.title).toBe('string');
    expect(res.body.title.length).toBeGreaterThan(0);
    expect(typeof res.body.description).toBe('string');
    expect(res.body.status).toBe('pending');
    expect(res.body.priority).toBe('medium');
  });

  it('should reject empty body with 400 and a title-specific error', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0].msg).toMatch(/title/i);
    expect(res.body.id).toBeUndefined();
    expect(taskRepository.create).not.toHaveBeenCalled();
  });

  it('should reject title exceeding 255 characters with 400', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'A'.repeat(256) });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0].msg).toMatch(/title/i);
    expect(res.body.id).toBeUndefined();
    expect(taskRepository.create).not.toHaveBeenCalled();
  });

  it('should reject empty title without persisting a task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.id).toBeUndefined();
    expect(taskRepository.create).not.toHaveBeenCalled();
  });

  it('should reject missing title without persisting a task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ description: 'No title here' });

    expect(res.status).toBe(400);
    expect(res.body.id).toBeUndefined();
    expect(taskRepository.create).not.toHaveBeenCalled();
  });

  it('should reject whitespace-only title without persisting a task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.id).toBeUndefined();
    expect(taskRepository.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/tasks', () => {
  let app: express.Application;

  const ownerTask = {
    id: 'task-owner-1',
    title: 'Owner Task',
    description: 'Belongs to user-123',
    status: 'pending' as const,
    priority: 'medium' as const,
    dueDate: null,
    userId: 'user-123',
    assignedTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const otherUserTask = {
    id: 'task-other-1',
    title: 'Other User Task',
    description: 'Belongs to user-999',
    status: 'in_progress' as const,
    priority: 'high' as const,
    dueDate: null,
    userId: 'user-999',
    assignedTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tagRepository.getTagsForTask).mockResolvedValue([]);
    vi.mocked(tagRepository.getTagsForTasks).mockResolvedValue(new Map());
    app = createApp();
  });

  it('should return only the authenticated user tasks (happy path)', async () => {
    vi.mocked(taskRepository.findByUser).mockResolvedValue([ownerTask]);
    vi.mocked(taskRepository.countByUser).mockResolvedValue(1);

    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('task-owner-1');
    expect(res.body.data[0].title).toBe('Owner Task');
    expect(res.body.pagination.total).toBe(1);
  });

  it('should not return tasks belonging to other users', async () => {
    vi.mocked(taskRepository.findByUser).mockResolvedValue([ownerTask, otherUserTask]);
    vi.mocked(taskRepository.countByUser).mockResolvedValue(2);

    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].userId).toBe('user-123');
    expect(res.body.data.every((t: any) => t.userId === 'user-123')).toBe(true);
  });

  it('should call findByUser with the authenticated user id', async () => {
    vi.mocked(taskRepository.findByUser).mockResolvedValue([]);
    vi.mocked(taskRepository.countByUser).mockResolvedValue(0);

    await request(app)
      .get('/api/tasks')
      .set('Authorization', 'Bearer test-token');

    expect(taskRepository.findByUser).toHaveBeenCalledWith('user-123', expect.anything(), expect.anything(), expect.anything());
  });
});
