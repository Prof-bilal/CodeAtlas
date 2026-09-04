import { describe, it, expect } from 'vitest';
import { generateId, chunk, unique, groupBy, flatten, compact, range, shuffle, sample, sum, average, min, max } from '../src/utils/arrays.js';

describe('Array Utilities', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('chunk', () => {
    it('should chunk arrays', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
  });

  describe('unique', () => {
    it('should remove duplicates', () => {
      expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });
  });

  describe('groupBy', () => {
    it('should group by key', () => {
      const items = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ];
      expect(groupBy(items, 'type')).toEqual({
        a: [{ type: 'a', value: 1 }, { type: 'a', value: 3 }],
        b: [{ type: 'b', value: 2 }],
      });
    });
  });

  describe('flatten', () => {
    it('should flatten nested arrays', () => {
      expect(flatten([[1, 2], [3, 4], [5]])).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('compact', () => {
    it('should remove null/undefined values', () => {
      expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
    });
  });

  describe('range', () => {
    it('should generate number ranges', () => {
      expect(range(0, 5)).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('shuffle', () => {
    it('should shuffle array', () => {
      const arr = [1, 2, 3, 4, 5];
      const shuffled = shuffle(arr);
      expect(shuffled.length).toBe(arr.length);
    });
  });

  describe('sample', () => {
    it('should return random samples', () => {
      const arr = [1, 2, 3, 4, 5];
      const sampled = sample(arr, 2);
      expect(sampled.length).toBe(2);
    });
  });

  describe('sum', () => {
    it('should sum numbers', () => {
      expect(sum([1, 2, 3, 4, 5])).toBe(15);
    });
  });

  describe('average', () => {
    it('should calculate average', () => {
      expect(average([1, 2, 3, 4, 5])).toBe(3);
    });
  });

  describe('min', () => {
    it('should find minimum', () => {
      expect(min([3, 1, 4, 1, 5, 9, 2, 6])).toBe(1);
    });
  });

  describe('max', () => {
    it('should find maximum', () => {
      expect(max([3, 1, 4, 1, 5, 9, 2, 6])).toBe(9);
    });
  });
});
