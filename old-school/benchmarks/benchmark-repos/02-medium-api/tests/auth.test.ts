import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken, generateRefreshToken, decodeToken } from '../src/auth/jwt.js';
import { hashPassword, comparePassword, generateRandomPassword } from '../src/auth/password.js';

describe('JWT', () => {
  const payload = { userId: 'user-1', email: 'test@example.com', role: 'user' };

  describe('generateToken', () => {
    it('should generate a token', () => {
      const token = generateToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateToken(payload);
      const decoded = verifyToken(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
    });

    it('should throw for invalid token', () => {
      expect(() => verifyToken('invalid-token')).toThrow();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a refresh token', () => {
      const token = generateRefreshToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('decodeToken', () => {
    it('should decode a token', () => {
      const token = generateToken(payload);
      const decoded = decodeToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(payload.userId);
    });

    it('should return null for invalid token', () => {
      const decoded = decodeToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });
});

describe('Password', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const hash = await hashPassword('password123');
      expect(hash).toBeDefined();
      expect(hash).not.toBe('password123');
    });
  });

  describe('comparePassword', () => {
    it('should compare passwords correctly', async () => {
      const hash = await hashPassword('password123');
      const result = await comparePassword('password123', hash);
      expect(result).toBe(true);
    });

    it('should return false for wrong password', async () => {
      const hash = await hashPassword('password123');
      const result = await comparePassword('wrongpassword', hash);
      expect(result).toBe(false);
    });
  });

  describe('generateRandomPassword', () => {
    it('should generate a random password', () => {
      const password = generateRandomPassword();
      expect(password).toBeDefined();
      expect(password.length).toBe(16);
    });

    it('should generate password with custom length', () => {
      const password = generateRandomPassword(32);
      expect(password.length).toBe(32);
    });
  });
});
