import { describe, it, expect } from 'vitest';
import { generateId, generateToken, generateApiKey } from '../../src/utils/crypto.js';

describe('Crypto Utils', () => {
  describe('generateId', () => {
    it('should generate unique ids', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(0);
    });
  });

  describe('generateToken', () => {
    it('should generate token', () => {
      const token = generateToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('generateApiKey', () => {
    it('should generate api key with prefix', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^sk_/);
    });
  });
});
