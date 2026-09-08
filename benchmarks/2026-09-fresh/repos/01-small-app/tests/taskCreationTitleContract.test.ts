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

  describe('rejection: empty or missing title must be refused', () => {
    it('rejects an empty string title with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: '' });

      expect(res.status).toBe(400);
    });

    it('rejects a missing title field with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ description: 'has description but no title' });

      expect(res.status).toBe(400);
    });

    it('rejects a whitespace-only title with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: '   \t\n   ' });

      expect(res.status).toBe(400);
    });

    it('rejects an empty body with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns a title-specific error message on rejection', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: '' });

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThan(0);
      expect(res.body.errors[0].msg).toMatch(/title/i);
    });

    it('does not return a task id when title is empty', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: '' });

      expect(res.body.id).toBeUndefined();
    });

    it('does not return a task id when title is missing', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ description: 'no title' });

      expect(res.body.id).toBeUndefined();
    });

    it('does not create a task visible in the task list after rejection', async () => {
      vi.mocked(taskRepository.findByUser).mockResolvedValue([]);
      vi.mocked(taskRepository.countByUser).mockResolvedValue(0);

      await request(app)
        .post('/api/tasks')
        .send({ title: '' });

      const listRes = await request(app).get('/api/tasks');

      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(0);
    });
  });

  describe('acceptance: a valid title must create the task', () => {
    it('creates a task with a valid title and returns HTTP 201', async () => {
      vi.mocked(taskRepository.create).mockResolvedValue(createdTask);

      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'Buy groceries' });

      expect(res.status).toBe(201);
    });

    it('returns a task id when title is valid', async () => {
      vi.mocked(taskRepository.create).mockResolvedValue(createdTask);

      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'Buy groceries' });

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('string');
    });

    it('returns the exact title the client sent', async () => {
      vi.mocked(taskRepository.create).mockResolvedValue({
        ...createdTask,
        title: 'Clean the garage',
      });

      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'Clean the garage' });

      expect(res.body.title).toBe('Clean the garage');
    });

    it('creates a task with a single-character title', async () => {
      vi.mocked(taskRepository.create).mockResolvedValue({
        ...createdTask,
        title: 'x',
      });

      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'x' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('x');
      expect(res.body.id).toBeDefined();
    });

    it('trims leading and trailing whitespace from a valid title', async () => {
      vi.mocked(taskRepository.create).mockResolvedValue({
        ...createdTask,
        title: 'Clean the garage',
      });

      const res = await request(app)
        .post('/api/tasks')
        .send({ title: '  Clean the garage  ' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Clean the garage');
    });

    it('the newly created task appears in the task list', async () => {
      vi.mocked(taskRepository.create).mockResolvedValue(createdTask);
      vi.mocked(taskRepository.findByUser).mockResolvedValue([createdTask]);
      vi.mocked(taskRepository.countByUser).mockResolvedValue(1);

      await request(app)
        .post('/api/tasks')
        .send({ title: 'Buy groceries' });

      const listRes = await request(app).get('/api/tasks');

      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].title).toBe('Buy groceries');
    });
  });
});
