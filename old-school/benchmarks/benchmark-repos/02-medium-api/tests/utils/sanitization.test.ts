import { describe, it, expect } from 'vitest';
import { sanitizeHtml, stripTags, truncate, slugify, camelToSnake, snakeToCamel } from '../../src/utils/sanitization.js';

describe('Sanitization Utils', () => {
  describe('sanitizeHtml', () => {
    it('should remove dangerous tags', () => {
      const result = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
    });
  });

  describe('stripTags', () => {
    it('should strip all HTML tags', () => {
      const result = stripTags('<div><p>Hello</p></div>');
      expect(result).toBe('Hello');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      const result = truncate('Hello World', 5);
      expect(result).toBe('Hello...');
    });

    it('should not truncate short strings', () => {
      const result = truncate('Hi', 10);
      expect(result).toBe('Hi');
    });
  });

  describe('slugify', () => {
    it('should create slug from string', () => {
      const result = slugify('Hello World!');
      expect(result).toBe('hello-world');
    });
  });

  describe('camelToSnake', () => {
    it('should convert camelCase to snake_case', () => {
      expect(camelToSnake('helloWorld')).toBe('hello_world');
      expect(camelToSnake('firstName')).toBe('first_name');
    });
  });

  describe('snakeToCamel', () => {
    it('should convert snake_case to camelCase', () => {
      expect(snakeToCamel('hello_world')).toBe('helloWorld');
      expect(snakeToCamel('first_name')).toBe('firstName');
    });
  });
});
