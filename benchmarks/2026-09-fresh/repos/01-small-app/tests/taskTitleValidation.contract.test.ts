import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
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

const createdTask = {
  id: 'task-created-1',
  title: 'Buy groceries',
  description: null,
  status: 'pending' as const,
  priority: 'medium' as const,
  dueDate: null,
  userId: 'user-123',
  assignedTo: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('POST /api/tasks — title validation contract', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tagRepository.getTagsForTask).mockResolvedValue([]);
    vi.mocked(tagRepository.getTagsForTasks).mockResolvedValue(new Map());
    vi.mocked(taskRepository.create).mockResolvedValue(createdTask);
    app = createApp();
  });

  describe('rejection: empty or missing title must return 400', () => {
    it('rejects an empty string title with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: '', description: 'has a description' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThan(0);
      expect(res.body.errors[0].msg).toMatch(/title/i);
    });

    it('rejects a missing title key with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ description: 'no title field at all' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors[0].msg).toMatch(/title/i);
    });

    it('rejects a whitespace-only title with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: '   \t  \n  ' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].msg).toMatch(/title/i);
    });

    it('rejects an empty object body with HTTP 400 and a title error', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].msg).toMatch(/title/i);
    });

    it('rejects a title exceeding 255 characters with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'x'.repeat(256) });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].msg).toMatch(/title/i);
    });
  });

  describe('rejection: response must not contain a created task', () => {
    it('returns no task id when title is empty', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: '' });

      expect(res.body.id).toBeUndefined();
      expect(res.body.title).toBeUndefined();
    });

    it('returns no task id when title is missing', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ description: 'desc' });

      expect(res.body.id).toBeUndefined();
      expect(res.body.title).toBeUndefined();
    });
  });

  describe('acceptance: valid title must create and return the task', () => {
    it('accepts a minimal valid title (single character) and returns 201', async () => {
      vi.mocked(taskRepository.create).mockResolvedValue({
        ...createdTask,
        title: 'x',
      });

      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'x' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('x');
    });

    it('accepts a normal title and returns a complete task object', async () => {
      vi.mocked(taskRepository.create).mockResolvedValue({
        ...createdTask,
        title: 'Buy groceries',
        description: 'Milk and eggs',
      });

      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'Buy groceries', description: 'Milk and eggs' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(String),
        title: 'Buy groceries',
        description: 'Milk and eggs',
        status: expect.any(String),
        priority: expect.any(String),
        userId: 'user-123',
      });
    });

    it('preserves the exact title text in the response', async () => {
      vi.mocked(taskRepository.create).mockResolvedValue({
        ...createdTask,
        title: 'Clean the garage',
      });

      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'Clean the garage' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Clean the garage');
    });

    it('trims whitespace from a valid title', async () => {
      vi.mocked(taskRepository.create).mockResolvedValue({
        ...createdTask,
        title: 'Trimmed title',
      });

      const res = await request(app)
        .post('/api/tasks')
        .send({ title: '  Trimmed title  ' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Trimmed title');
    });
  });
});
