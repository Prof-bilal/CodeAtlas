import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeInput, escapeRegex, truncate, slugify, capitalize, camelToSnake, snakeToCamel, deepClone, isEmpty, pick, omit } from '../src/utils/helpers.js';

describe('String Helpers', () => {
  describe('sanitizeHtml', () => {
    it('should escape HTML characters', () => {
      expect(sanitizeHtml('<script>alert("xss")</script>')).toContain('&lt;');
    });

    it('should escape quotes', () => {
      expect(sanitizeHtml('"hello"')).toContain('&quot;');
    });

    it('should escape forward slash', () => {
      expect(sanitizeHtml('</script>')).toContain('&#x2F;');
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize input strings', () => {
      expect(sanitizeInput('hello world')).toBe('hello world');
    });

    it('should handle special characters', () => {
      const result = sanitizeInput("O'Brien");
      expect(result).toContain('&#x27;');
    });
  });

  describe('escapeRegex', () => {
    it('should escape regex special characters', () => {
      expect(escapeRegex('hello.world')).toBe('hello\\.world');
    });

    it('should escape multiple special characters', () => {
      expect(escapeRegex('hello+world*')).toBe('hello\\+world\\*');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(truncate('hello world', 5)).toBe('hello...');
    });

    it('should not truncate short strings', () => {
      expect(truncate('hi', 5)).toBe('hi');
    });
  });

  describe('slugify', () => {
    it('should create URL-friendly slugs', () => {
      expect(slugify('Hello World!')).toBe('hello-world');
    });

    it('should handle multiple spaces', () => {
      expect(slugify('Hello   World')).toBe('hello-world');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('should handle empty string', () => {
      expect(capitalize('')).toBe('');
    });
  });

  describe('camelToSnake', () => {
    it('should convert camelCase to snake_case', () => {
      expect(camelToSnake('helloWorld')).toBe('hello_world');
    });

    it('should handle multiple words', () => {
      expect(camelToSnake('helloBeautifulWorld')).toBe('hello_beautiful_world');
    });
  });

  describe('snakeToCamel', () => {
    it('should convert snake_case to camelCase', () => {
      expect(snakeToCamel('hello_world')).toBe('helloWorld');
    });

    it('should handle multiple underscores', () => {
      expect(snakeToCamel('hello_beautiful_world')).toBe('helloBeautifulWorld');
    });
  });
});

describe('Object Helpers', () => {
  describe('deepClone', () => {
    it('should deep clone objects', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });

    it('should clone arrays', () => {
      const original = [1, 2, [3, 4]];
      const cloned = deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
    });
  });

  describe('isEmpty', () => {
    it('should check if value is empty', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty({})).toBe(true);
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty({ a: 1 })).toBe(false);
    });
  });

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('should handle non-existent keys', () => {
      const obj = { a: 1, b: 2 };
      expect(pick(obj, ['a', 'x'])).toEqual({ a: 1 });
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });

    it('should handle non-existent keys', () => {
      const obj = { a: 1, b: 2 };
      expect(omit(obj, ['x'])).toEqual({ a: 1, b: 2 });
    });
  });
});
