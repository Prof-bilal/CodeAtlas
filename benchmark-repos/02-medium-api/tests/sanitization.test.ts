import { describe, it, expect } from 'vitest';
import { sanitizeHtml, truncate, slugify, capitalize, camelToSnake, snakeToCamel } from '../src/utils/helpers.js';

describe('sanitizeHtml', () => {
  it('should escape HTML tags', () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).toContain('&lt;');
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
