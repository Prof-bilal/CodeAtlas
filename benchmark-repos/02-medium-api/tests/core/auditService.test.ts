import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService } from '../../src/core/audit/auditService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('AuditService', () => {
  let auditService: AuditService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    auditService = new AuditService(mockEventBus);
  });

  describe('log', () => {
    it('should create audit log entry', async () => {
      const data = {
        userId: 'user-1',
        action: 'user:login',
        resource: 'user',
        resourceId: 'user-1',
        details: { ip: '127.0.0.1' },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      };

      const result = await auditService.log(data);

      expect(result.id).toBeDefined();
      expect(result.action).toBe('user:login');
      expect(mockEventBus.emit).toHaveBeenCalledWith('audit:logged', { auditLog: result });
    });
  });

  describe('query', () => {
    it('should filter logs by userId', async () => {
      await auditService.log({ userId: 'user-1', action: 'test', resource: 'test', resourceId: '1', details: {}, ipAddress: '127.0.0.1', userAgent: 'test' });
      await auditService.log({ userId: 'user-2', action: 'test', resource: 'test', resourceId: '2', details: {}, ipAddress: '127.0.0.1', userAgent: 'test' });

      const results = await auditService.query({ userId: 'user-1' });
      expect(results).toHaveLength(1);
      expect(results[0].userId).toBe('user-1');
    });

    it('should filter logs by action', async () => {
      await auditService.log({ userId: 'user-1', action: 'user:login', resource: 'user', resourceId: '1', details: {}, ipAddress: '127.0.0.1', userAgent: 'test' });
      await auditService.log({ userId: 'user-1', action: 'user:logout', resource: 'user', resourceId: '1', details: {}, ipAddress: '127.0.0.1', userAgent: 'test' });

      const results = await auditService.query({ action: 'user:login' });
      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('user:login');
    });
  });

  describe('getStats', () => {
    it('should return correct stats', async () => {
      await auditService.log({ userId: 'user-1', action: 'test', resource: 'test', resourceId: '1', details: {}, ipAddress: '127.0.0.1', userAgent: 'test' });
      await auditService.log({ userId: 'user-1', action: 'test', resource: 'test', resourceId: '2', details: {}, ipAddress: '127.0.0.1', userAgent: 'test' });
      await auditService.log({ userId: 'user-2', action: 'other', resource: 'test', resourceId: '3', details: {}, ipAddress: '127.0.0.1', userAgent: 'test' });

      const stats = await auditService.getStats();
      expect(stats.totalLogs).toBe(3);
      expect(stats.uniqueUsers).toBe(2);
      expect(stats.topActions['test']).toBe(2);
    });
  });
});
