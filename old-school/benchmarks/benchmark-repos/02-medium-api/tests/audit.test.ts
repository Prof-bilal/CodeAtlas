import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService } from '../src/core/audit/auditService.js';
import { auditRepository } from '../src/repositories/auditRepository.js';

vi.mock('../src/repositories/auditRepository.js');

describe('AuditService', () => {
  let auditService: AuditService;

  beforeEach(() => {
    auditService = new AuditService();
    vi.clearAllMocks();
  });

  const mockAuditLog = {
    id: 'audit-123',
    userId: 'user-123',
    action: 'create',
    resource: 'task',
    resourceId: 'task-456',
    changes: { title: 'New Task' },
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date(),
  };

  describe('log', () => {
    it('should create audit log', async () => {
      vi.mocked(auditRepository.create).mockResolvedValue(mockAuditLog);

      const result = await auditService.log({
        userId: 'user-123',
        action: 'create',
        resource: 'task',
        resourceId: 'task-456',
        changes: { title: 'New Task' },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(result.id).toBe('audit-123');
      expect(auditRepository.create).toHaveBeenCalled();
    });
  });

  describe('getLogs', () => {
    it('should return paginated logs', async () => {
      vi.mocked(auditRepository.findAll).mockResolvedValue([mockAuditLog]);
      vi.mocked(auditRepository.count).mockResolvedValue(1);

      const result = await auditService.getLogs(1, 50);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getLogsByUser', () => {
    it('should return user logs', async () => {
      vi.mocked(auditRepository.findByUserId).mockResolvedValue([mockAuditLog]);
      vi.mocked(auditRepository.countByUserId).mockResolvedValue(1);

      const result = await auditService.getLogsByUser('user-123');

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent activity', async () => {
      vi.mocked(auditRepository.findRecent).mockResolvedValue([mockAuditLog]);

      const result = await auditService.getRecentActivity(10);

      expect(result).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('should return audit stats', async () => {
      vi.mocked(auditRepository.count).mockResolvedValue(100);
      vi.mocked(auditRepository.countToday).mockResolvedValue(10);
      vi.mocked(auditRepository.countUniqueUsers).mockResolvedValue(5);
      vi.mocked(auditRepository.getTopActions).mockResolvedValue([
        { action: 'create', count: 50 },
        { action: 'update', count: 30 },
      ]);
      vi.mocked(auditRepository.getTopResources).mockResolvedValue([
        { resource: 'task', count: 40 },
        { resource: 'user', count: 20 },
      ]);

      const result = await auditService.getStats();

      expect(result.totalLogs).toBe(100);
      expect(result.todayLogs).toBe(10);
      expect(result.uniqueUsers).toBe(5);
      expect(result.topActions).toHaveLength(2);
      expect(result.topResources).toHaveLength(2);
    });
  });
});
