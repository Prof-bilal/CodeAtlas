import { describe, it, expect } from 'vitest';
import { AuditRepository } from '../../src/database/repositories/auditRepository.js';
import { EventBus } from '../../src/events/eventBus.js';

describe('AuditRepository', () => {
  let repo: AuditRepository;
  let mockEventBus: any;

  beforeEach(() => {
    mockEventBus = { emit: vi.fn() };
    repo = new AuditRepository(mockEventBus);
  });

  it('should create audit record', async () => {
    const log = await repo.create({ userId: 'user-1', action: 'login', resource: 'user', resourceId: 'u1', ipAddress: '127.0.0.1', userAgent: 'test' });
    expect(log.id).toBeDefined();
    expect(log.action).toBe('login');
  });

  it('should query audit logs', async () => {
    await repo.create({ userId: 'user-1', action: 'login', resource: 'user', resourceId: 'u1', ipAddress: '127.0.0.1', userAgent: 'test' });
    await repo.create({ userId: 'user-2', action: 'logout', resource: 'user', resourceId: 'u2', ipAddress: '127.0.0.1', userAgent: 'test' });

    const logs = await repo.query({ userId: 'user-1' });
    expect(logs).toHaveLength(1);
  });
});
