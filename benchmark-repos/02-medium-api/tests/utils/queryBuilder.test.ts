import { describe, it, expect } from 'vitest';
import { paginate, buildWhereClause, buildOrderByClause, buildSelectClause } from '../../src/utils/queryBuilder.js';

describe('Query Builder Utils', () => {
  describe('paginate', () => {
    it('should return limit and offset', () => {
      const result = paginate(2, 20);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(20);
    });

    it('should handle page 1', () => {
      const result = paginate(1, 20);
      expect(result.offset).toBe(0);
    });
  });

  describe('buildWhereClause', () => {
    it('should build where clause from filters', () => {
      const result = buildWhereClause({ status: 'active', userId: 'user-1' });
      expect(result).toContain('status');
      expect(result).toContain('active');
    });
  });

  describe('buildOrderByClause', () => {
    it('should build order by clause', () => {
      const result = buildOrderByClause('createdAt', 'desc');
      expect(result).toContain('createdAt');
      expect(result).toContain('desc');
    });
  });

  describe('buildSelectClause', () => {
    it('should build select clause', () => {
      const result = buildSelectClause(['id', 'name', 'email']);
      expect(result).toContain('id');
      expect(result).toContain('name');
    });
  });
});
