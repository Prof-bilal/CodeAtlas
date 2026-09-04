import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseService } from '../src/database/databaseService.js';

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] }),
    connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  })),
}));

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(() => {
    service = new DatabaseService();
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should connect to database', async () => {
      await expect(service.connect()).resolves.not.toThrow();
    });
  });

  describe('query', () => {
    it('should execute query', async () => {
      const result = await service.query('SELECT 1');
      expect(result).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return true when healthy', async () => {
      const result = await service.healthCheck();
      expect(result).toBe(true);
    });
  });

  describe('getPoolStats', () => {
    it('should return pool statistics', () => {
      const stats = service.getPoolStats();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('idle');
      expect(stats).toHaveProperty('waiting');
    });
  });
});
