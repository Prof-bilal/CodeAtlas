import { describe, it, expect } from 'vitest';
import { formatDate, parseDate, isAfter, isBefore, isSameDay, addDays, addHours, addMinutes, differenceInDays, differenceInHours, differenceInMinutes, startOfDay, endOfDay, startOfWeek, endOfWeek, isOverdue, getRelativeTimeString } from '../src/utils/date.js';

describe('Date Utilities', () => {
  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2024-01-15T10:30:00');
      const formatted = formatDate(date, 'YYYY-MM-DD');
      expect(formatted).toBe('2024-01-15');
    });
  });

  describe('parseDate', () => {
    it('should parse valid date strings', () => {
      const date = parseDate('2024-01-15');
      expect(date).toBeInstanceOf(Date);
    });
  });

  describe('isAfter', () => {
    it('should check if date is after another', () => {
      const date1 = new Date('2024-01-20');
      const date2 = new Date('2024-01-15');
      expect(isAfter(date1, date2)).toBe(true);
    });
  });

  describe('isBefore', () => {
    it('should check if date is before another', () => {
      const date1 = new Date('2024-01-10');
      const date2 = new Date('2024-01-15');
      expect(isBefore(date1, date2)).toBe(true);
    });
  });

  describe('isSameDay', () => {
    it('should check if dates are same day', () => {
      const date1 = new Date('2024-01-15T10:00:00');
      const date2 = new Date('2024-01-15T15:00:00');
      expect(isSameDay(date1, date2)).toBe(true);
    });
  });

  describe('addDays', () => {
    it('should add days to date', () => {
      const date = new Date('2024-01-15');
      const result = addDays(date, 5);
      expect(result.getDate()).toBe(20);
    });
  });

  describe('addHours', () => {
    it('should add hours to date', () => {
      const date = new Date('2024-01-15T10:00:00');
      const result = addHours(date, 5);
      expect(result.getHours()).toBe(15);
    });
  });

  describe('addMinutes', () => {
    it('should add minutes to date', () => {
      const date = new Date('2024-01-15T10:00:00');
      const result = addMinutes(date, 30);
      expect(result.getMinutes()).toBe(30);
    });
  });

  describe('differenceInDays', () => {
    it('should calculate day difference', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-20');
      expect(differenceInDays(date1, date2)).toBe(5);
    });
  });

  describe('differenceInHours', () => {
    it('should calculate hour difference', () => {
      const date1 = new Date('2024-01-15T10:00:00');
      const date2 = new Date('2024-01-15T15:00:00');
      expect(differenceInHours(date1, date2)).toBe(5);
    });
  });

  describe('differenceInMinutes', () => {
    it('should calculate minute difference', () => {
      const date1 = new Date('2024-01-15T10:00:00');
      const date2 = new Date('2024-01-15T10:30:00');
      expect(differenceInMinutes(date1, date2)).toBe(30);
    });
  });

  describe('startOfDay', () => {
    it('should get start of day', () => {
      const date = new Date('2024-01-15T10:30:00');
      const start = startOfDay(date);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
    });
  });

  describe('endOfDay', () => {
    it('should get end of day', () => {
      const date = new Date('2024-01-15T10:30:00');
      const end = endOfDay(date);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
    });
  });

  describe('startOfWeek', () => {
    it('should get start of week', () => {
      const date = new Date('2024-01-17');
      const start = startOfWeek(date);
      expect(start.getDay()).toBe(0);
    });
  });

  describe('endOfWeek', () => {
    it('should get end of week', () => {
      const date = new Date('2024-01-17');
      const end = endOfWeek(date);
      expect(end.getDay()).toBe(6);
    });
  });

  describe('isOverdue', () => {
    it('should check if date is overdue', () => {
      const pastDate = new Date('2024-01-01');
      const futureDate = new Date('2025-12-31');
      expect(isOverdue(pastDate)).toBe(true);
      expect(isOverdue(futureDate)).toBe(false);
    });
  });

  describe('getRelativeTimeString', () => {
    it('should return relative time string', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const result = getRelativeTimeString(fiveMinutesAgo);
      expect(result).toContain('minutes ago');
    });
  });
});
