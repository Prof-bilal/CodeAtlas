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

describe('POST /api/tasks — empty title rejected, valid title created', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tagRepository.getTagsForTask).mockResolvedValue([]);
    vi.mocked(tagRepository.getTagsForTasks).mockResolvedValue(new Map());
    vi.mocked(taskRepository.create).mockResolvedValue(createdTask);
    app = createApp();
  });

  it('rejects an empty title with 400 and does not create a task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(taskRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a missing title with 400 and does not create a task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ description: 'no title' });

    expect(res.status).toBe(400);
    expect(taskRepository.create).not.toHaveBeenCalled();
  });

  it('creates a task with a valid title and returns 201', async () => {
    vi.mocked(taskRepository.create).mockResolvedValue({
      ...createdTask,
      title: 'Write tests',
    });

    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Write tests' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Write tests');
    expect(taskRepository.create).toHaveBeenCalledTimes(1);
  });
});
