import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRepository } from '../src/database/repositories/userRepository.js';
import { TaskRepository } from '../src/database/repositories/taskRepository.js';
import { PaymentRepository } from '../src/database/repositories/paymentRepository.js';
import { NotificationRepository } from '../src/database/repositories/notificationRepository.js';
import { AuditRepository } from '../src/database/repositories/auditRepository.js';
import { ApiKeyRepository } from '../src/database/repositories/apiKeyRepository.js';
import { FileRepository } from '../src/database/repositories/fileRepository.js';
import { WebhookRepository } from '../src/database/repositories/webhookRepository.js';
import { databaseService } from '../src/database/databaseService.js';

vi.mock('../src/database/databaseService.js', () => ({
  databaseService: {
    query: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  },
}));

describe('UserRepository', () => {
  let repository: UserRepository;

  beforeEach(() => {
    repository = new UserRepository();
    vi.clearAllMocks();
  });

  it('should find user by id', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockUser], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

    const user = await repository.findById('user-1');
    expect(user).toEqual(mockUser);
  });

  it('should create user', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockUser], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const user = await repository.create({ email: 'test@example.com', name: 'Test User', passwordHash: 'hash' });
    expect(user).toEqual(mockUser);
  });
});

describe('TaskRepository', () => {
  let repository: TaskRepository;

  beforeEach(() => {
    repository = new TaskRepository();
    vi.clearAllMocks();
  });

  it('should find task by id', async () => {
    const mockTask = { id: 'task-1', title: 'Test Task' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockTask], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

    const task = await repository.findById('task-1');
    expect(task).toEqual(mockTask);
  });

  it('should create task', async () => {
    const mockTask = { id: 'task-1', title: 'Test Task', userId: 'user-1' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockTask], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const task = await repository.create({ title: 'Test Task', userId: 'user-1' });
    expect(task).toEqual(mockTask);
  });
});

describe('PaymentRepository', () => {
  let repository: PaymentRepository;

  beforeEach(() => {
    repository = new PaymentRepository();
    vi.clearAllMocks();
  });

  it('should find payment by id', async () => {
    const mockPayment = { id: 'payment-1', amount: 1000 };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockPayment], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

    const payment = await repository.findById('payment-1');
    expect(payment).toEqual(mockPayment);
  });

  it('should create payment', async () => {
    const mockPayment = { id: 'payment-1', amount: 1000, userId: 'user-1' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockPayment], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const payment = await repository.create({ userId: 'user-1', amount: 1000 });
    expect(payment).toEqual(mockPayment);
  });
});

describe('NotificationRepository', () => {
  let repository: NotificationRepository;

  beforeEach(() => {
    repository = new NotificationRepository();
    vi.clearAllMocks();
  });

  it('should find notification by id', async () => {
    const mockNotification = { id: 'notif-1', title: 'Test' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockNotification], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

    const notification = await repository.findById('notif-1');
    expect(notification).toEqual(mockNotification);
  });

  it('should create notification', async () => {
    const mockNotification = { id: 'notif-1', title: 'Test', userId: 'user-1' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockNotification], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const notification = await repository.create({ userId: 'user-1', type: 'info', title: 'Test' });
    expect(notification).toEqual(mockNotification);
  });
});

describe('AuditRepository', () => {
  let repository: AuditRepository;

  beforeEach(() => {
    repository = new AuditRepository();
    vi.clearAllMocks();
  });

  it('should create audit log', async () => {
    const mockAudit = { id: 'audit-1', action: 'create', resource: 'task' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockAudit], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const audit = await repository.create({ action: 'create', resource: 'task' });
    expect(audit).toEqual(mockAudit);
  });
});

describe('ApiKeyRepository', () => {
  let repository: ApiKeyRepository;

  beforeEach(() => {
    repository = new ApiKeyRepository();
    vi.clearAllMocks();
  });

  it('should find api key by id', async () => {
    const mockApiKey = { id: 'key-1', name: 'Test Key' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockApiKey], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

    const apiKey = await repository.findById('key-1');
    expect(apiKey).toEqual(mockApiKey);
  });
});

describe('FileRepository', () => {
  let repository: FileRepository;

  beforeEach(() => {
    repository = new FileRepository();
    vi.clearAllMocks();
  });

  it('should find file by id', async () => {
    const mockFile = { id: 'file-1', filename: 'test.txt' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockFile], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

    const file = await repository.findById('file-1');
    expect(file).toEqual(mockFile);
  });
});

describe('WebhookRepository', () => {
  let repository: WebhookRepository;

  beforeEach(() => {
    repository = new WebhookRepository();
    vi.clearAllMocks();
  });

  it('should find webhook by id', async () => {
    const mockWebhook = { id: 'webhook-1', url: 'https://example.com' };
    vi.mocked(databaseService.query).mockResolvedValue({ rows: [mockWebhook], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

    const webhook = await repository.findById('webhook-1');
    expect(webhook).toEqual(mockWebhook);
  });
});
