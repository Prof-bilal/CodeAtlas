import { describe, it, expect } from 'vitest';
import { generateRandomString, generateUUID, hashString, generateSalt, deriveKey, encrypt, decrypt, timingSafeEqual, generateHmac, verifyHmac } from '../src/utils/crypto.js';

describe('Crypto Utilities', () => {
  describe('generateRandomString', () => {
    it('should generate random string of specified length', () => {
      const str = generateRandomString(16);
      expect(str).toHaveLength(16);
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('hashString', () => {
    it('should hash strings', () => {
      const hash = hashString('test');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('generateSalt', () => {
    it('should generate salt', () => {
      const salt = generateSalt();
      expect(salt).toBeDefined();
      expect(typeof salt).toBe('string');
    });
  });

  describe('timingSafeEqual', () => {
    it('should compare strings safely', () => {
      expect(timingSafeEqual('abc', 'abc')).toBe(true);
      expect(timingSafeEqual('abc', 'def')).toBe(false);
    });
  });
});
