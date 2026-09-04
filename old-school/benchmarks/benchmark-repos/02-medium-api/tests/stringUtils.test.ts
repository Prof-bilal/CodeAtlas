import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeInput, escapeRegex, truncate, slugify, capitalize, camelToSnake, snakeToCamel, deepClone, isEmpty, pick, omit } from '../src/utils/helpers.js';

describe('String Helpers', () => {
  describe('sanitizeHtml', () => {
    it('should escape HTML characters', () => {
      expect(sanitizeHtml('<script>alert("xss")</script>')).toContain('&lt;');
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize input strings', () => {
      expect(sanitizeInput('hello world')).toBe('hello world');
    });
  });

  describe('escapeRegex', () => {
    it('should escape regex special characters', () => {
      expect(escapeRegex('hello.world')).toBe('hello\\.world');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(truncate('hello world', 5)).toBe('hello...');
    });
  });

  describe('slugify', () => {
    it('should create URL-friendly slugs', () => {
      expect(slugify('Hello World!')).toBe('hello-world');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
    });
  });

  describe('camelToSnake', () => {
    it('should convert camelCase to snake_case', () => {
      expect(camelToSnake('helloWorld')).toBe('hello_world');
    });
  });

  describe('snakeToCamel', () => {
    it('should convert snake_case to camelCase', () => {
      expect(snakeToCamel('hello_world')).toBe('helloWorld');
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
    });
  });

  describe('isEmpty', () => {
    it('should check if value is empty', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty({})).toBe(true);
      expect(isEmpty('hello')).toBe(false);
    });
  });

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });
  });
});
