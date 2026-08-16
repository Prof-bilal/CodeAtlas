import { describe, it, expect } from 'vitest';
import { debounce, throttle, deepClone, deepMerge } from '../../src/utils/helpers.js';

describe('Helpers', () => {
  describe('debounce', () => {
    it('should create debounced function', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced();
      debounced();
      debounced();
      // Function should not be called yet (debounced)
    });
  });

  describe('throttle', () => {
    it('should create throttled function', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);
      throttled();
      throttled();
      throttled();
    });
  });

  describe('deepClone', () => {
    it('should deep clone object', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });
  });

  describe('deepMerge', () => {
    it('should deep merge objects', () => {
      const a = { x: 1, y: { z: 2 } };
      const b = { y: { w: 3 }, v: 4 };
      const result = deepMerge(a, b);
      expect(result).toEqual({ x: 1, y: { z: 2, w: 3 }, v: 4 });
    });
  });
});
