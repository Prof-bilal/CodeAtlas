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
});
