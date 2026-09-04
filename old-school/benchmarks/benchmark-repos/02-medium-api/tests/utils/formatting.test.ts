import { describe, it, expect } from 'vitest';
import { calculateTotal, formatCurrency, formatPercentage } from '../../src/utils/formatting.js';

describe('Formatting Utils', () => {
  describe('calculateTotal', () => {
    it('should sum array of numbers', () => {
      expect(calculateTotal([100, 200, 300])).toBe(600);
    });

    it('should return 0 for empty array', () => {
      expect(calculateTotal([])).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('should format currency', () => {
      const result = formatCurrency(1000, 'USD');
      expect(result).toContain('1');
      expect(result).toContain('000');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage', () => {
      const result = formatPercentage(0.85);
      expect(result).toContain('85');
      expect(result).toContain('%');
    });
  });
});
