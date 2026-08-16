import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword, validatePasswordStrength } from '../../src/utils/password.js';

describe('Password Utils', () => {
  describe('hashPassword', () => {
    it('should hash password', async () => {
      const hash = await hashPassword('Password123');
      expect(hash).toBeDefined();
      expect(hash).not.toBe('Password123');
    });
  });

  describe('comparePassword', () => {
    it('should match correct password', async () => {
      const hash = await hashPassword('Password123');
      const result = await comparePassword('Password123', hash);
      expect(result).toBe(true);
    });

    it('should not match wrong password', async () => {
      const hash = await hashPassword('Password123');
      const result = await comparePassword('WrongPassword', hash);
      expect(result).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should accept strong password', () => {
      const result = validatePasswordStrength('StrongP@ss123');
      expect(result.valid).toBe(true);
    });

    it('should reject short password', () => {
      const result = validatePasswordStrength('abc');
      expect(result.valid).toBe(false);
    });
  });
});
