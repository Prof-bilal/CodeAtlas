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

const mockTask = {
  id: 'task-456',
  title: 'Buy groceries',
  description: '',
  status: 'pending' as const,
  priority: 'medium' as const,
  dueDate: null,
  userId: 'user-123',
  assignedTo: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('POST /api/tasks — title validation contract', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tagRepository.getTagsForTask).mockResolvedValue([]);
    vi.mocked(tagRepository.getTagsForTasks).mockResolvedValue(new Map());
    vi.mocked(taskRepository.create).mockResolvedValue(mockTask);
    app = createApp();
  });

  it('rejects an empty string title with HTTP 400 and a title error', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '', description: 'has a description' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0].msg).toMatch(/title/i);
    expect(res.body.id).toBeUndefined();
  });

  it('rejects a missing title key with HTTP 400 and a title error', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ description: 'no title field at all' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0].msg).toMatch(/title/i);
    expect(res.body.id).toBeUndefined();
  });

  it('rejects a whitespace-only title with HTTP 400', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '   \t  ' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].msg).toMatch(/title/i);
    expect(res.body.id).toBeUndefined();
  });

  it('rejects an empty object body with HTTP 400 and a title error', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].msg).toMatch(/title/i);
    expect(res.body.id).toBeUndefined();
  });

  it('accepts a valid title and returns HTTP 201 with the created task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Buy groceries' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('task-456');
    expect(res.body.title).toBe('Buy groceries');
  });

  it('preserves the exact title text in the response', async () => {
    vi.mocked(taskRepository.create).mockResolvedValue({
      ...mockTask,
      title: 'Clean the garage',
    });

    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Clean the garage' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Clean the garage');
  });
});
