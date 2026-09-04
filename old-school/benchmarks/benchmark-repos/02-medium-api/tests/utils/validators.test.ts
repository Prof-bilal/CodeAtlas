import { describe, it, expect } from 'vitest';
import { sanitizeInput, escapeHtml, validateEmail, validateUUID } from '../../src/utils/validators.js';

describe('Validators', () => {
  describe('sanitizeInput', () => {
    it('should sanitize HTML', () => {
      const result = sanitizeInput('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
    });

    it('should keep safe text', () => {
      const result = sanitizeInput('Hello World');
      expect(result).toBe('Hello World');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML entities', () => {
      const result = escapeHtml('<div>"test"</div>');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&quot;');
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email', () => {
      expect(validateEmail('test@example.com')).toBe(true);
    });

    it('should reject invalid email', () => {
      expect(validateEmail('not-an-email')).toBe(false);
    });
  });

  describe('validateUUID', () => {
    it('should accept valid UUID', () => {
      expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject invalid UUID', () => {
      expect(validateUUID('not-a-uuid')).toBe(false);
    });
  });
});
