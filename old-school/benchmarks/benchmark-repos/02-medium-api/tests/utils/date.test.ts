import { describe, it, expect } from 'vitest';
import { formatDate, formatRelativeTime, addDays, isExpired } from '../../src/utils/date.js';

describe('Date Utils', () => {
  describe('formatDate', () => {
    it('should format date', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatDate(date);
      expect(formatted).toBeDefined();
    });
  });

  describe('formatRelativeTime', () => {
    it('should return relative time', () => {
      const date = new Date(Date.now() - 60000);
      const relative = formatRelativeTime(date);
      expect(relative).toContain('ago');
    });
  });

  describe('addDays', () => {
    it('should add days', () => {
      const date = new Date('2024-01-01');
      const result = addDays(date, 5);
      expect(result.getDate()).toBe(6);
    });
  });

  describe('isExpired', () => {
    it('should detect expired date', () => {
      const past = new Date('2020-01-01');
      expect(isExpired(past)).toBe(true);
    });

    it('should detect non-expired date', () => {
      const future = new Date('2099-12-31');
      expect(isExpired(future)).toBe(false);
    });
  });
});
