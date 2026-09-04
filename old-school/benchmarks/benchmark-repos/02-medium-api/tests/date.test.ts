import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import { 
  formatDate, 
  parseDate, 
  isAfter, 
  isBefore, 
  isSameDay, 
  addDays, 
  addHours, 
  addMinutes, 
  differenceInDays, 
  differenceInHours, 
  differenceInMinutes, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  isOverdue, 
  getRelativeTimeString 
} from '../src/utils/date.js';

describe('Date Utils', () => {
  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2024-01-15T10:30:45');
      expect(formatDate(date, 'YYYY-MM-DD')).toBe('2024-01-15');
    });
  });

  describe('parseDate', () => {
    it('should parse valid dates', () => {
      const date = parseDate('2024-01-15');
      expect(date).toBeInstanceOf(Date);
    });

    it('should return null for invalid dates', () => {
      const date = parseDate('invalid');
      expect(date).toBeNull();
    });
  });

  describe('isAfter', () => {
    it('should check if date is after', () => {
      const date1 = new Date('2024-01-20');
      const date2 = new Date('2024-01-15');
      
      expect(isAfter(date1, date2)).toBe(true);
      expect(isAfter(date2, date1)).toBe(false);
    });
  });

  describe('isBefore', () => {
    it('should check if date is before', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-20');
      
      expect(isBefore(date1, date2)).toBe(true);
      expect(isBefore(date2, date1)).toBe(false);
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
    it('should add days', () => {
      const date = new Date('2024-01-15');
      expect(addDays(date, 5)).toEqual(new Date('2024-01-20'));
    });
  });

  describe('addHours', () => {
    it('should add hours', () => {
      const date = new Date('2024-01-15T10:00:00');
      expect(addHours(date, 5)).toEqual(new Date('2024-01-15T15:00:00'));
    });
  });

  describe('addMinutes', () => {
    it('should add minutes', () => {
      const date = new Date('2024-01-15T10:00:00');
      expect(addMinutes(date, 30)).toEqual(new Date('2024-01-15T10:30:00'));
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
      const date = new Date('2024-01-15T10:30:45');
      const start = startOfDay(date);
      
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
    });
  });

  describe('endOfDay', () => {
    it('should get end of day', () => {
      const date = new Date('2024-01-15T10:30:45');
      const end = endOfDay(date);
      
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
    });
  });

  describe('startOfWeek', () => {
    it('should get start of week', () => {
      const date = new Date('2024-01-17'); // Wednesday
      const start = startOfWeek(date);
      
      expect(start.getDay()).toBe(0); // Sunday
    });
  });

  describe('endOfWeek', () => {
    it('should get end of week', () => {
      const date = new Date('2024-01-17'); // Wednesday
      const end = endOfWeek(date);
      
      expect(end.getDay()).toBe(6); // Saturday
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
    it('should return relative time', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      const result = getRelativeTimeString(fiveMinutesAgo);
      expect(result).toBe('5 minutes ago');
    });
  });
});
