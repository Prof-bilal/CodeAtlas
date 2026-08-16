import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditServiceImpl } from '../src/services/auditService.js';
import { AuditRepository } from '../src/database/repositories/auditRepository.js';
import { eventBus } from '../src/events/eventBus.js';

vi.mock('../src/database/repositories/auditRepository.js');
vi.mock('../src/events/eventBus.js');

describe('AuditServiceImpl', () => {
  let service: AuditServiceImpl;
  let mockAuditRepository: any;

  beforeEach(() => {
    service = new AuditServiceImpl();
    mockAuditRepository = vi.mocked(AuditRepository.prototype);
    vi.clearAllMocks();
  });

  describe('log', () => {
    it('should create audit log', async () => {
      const mockAudit = { id: 'audit-1', action: 'create', resource: 'task' };
      mockAuditRepository.create.mockResolvedValue(mockAudit);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.log({
        action: 'create',
        resource: 'task',
        userId: 'user-1',
      });

      expect(result).toEqual(mockAudit);
      expect(mockAuditRepository.create).toHaveBeenCalled();
    });
  });

  describe('getLogsByUser', () => {
    it('should return logs for user', async () => {
      const mockLogs = [{ id: 'audit-1' }, { id: 'audit-2' }];
      mockAuditRepository.findByUserId.mockResolvedValue(mockLogs);

      const result = await service.getLogsByUser('user-1');
      expect(result).toEqual(mockLogs);
    });
  });

  describe('getLogsByResource', () => {
    it('should return logs for resource', async () => {
      const mockLogs = [{ id: 'audit-1' }];
      mockAuditRepository.findByResource.mockResolvedValue(mockLogs);

      const result = await service.getLogsByResource('task');
      expect(result).toEqual(mockLogs);
    });
  });

  describe('getLogsByAction', () => {
    it('should return logs for action', async () => {
      const mockLogs = [{ id: 'audit-1' }];
      mockAuditRepository.findByAction.mockResolvedValue(mockLogs);

      const result = await service.getLogsByAction('create');
      expect(result).toEqual(mockLogs);
    });
  });

  describe('getCount', () => {
    it('should return count', async () => {
      mockAuditRepository.count.mockResolvedValue(100);

      const result = await service.getCount();
      expect(result).toBe(100);
    });

    it('should return count for user', async () => {
      mockAuditRepository.count.mockResolvedValue(50);

      const result = await service.getCount('user-1');
      expect(result).toBe(50);
    });
  });

  describe('deleteOldLogs', () => {
    it('should delete old logs', async () => {
      mockAuditRepository.deleteOlderThan.mockResolvedValue(25);

      const result = await service.deleteOldLogs(90);
      expect(result).toBe(25);
    });
  });
});
