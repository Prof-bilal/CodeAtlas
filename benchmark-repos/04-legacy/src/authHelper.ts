// Auth helper utilities
// NOTE: Most of these just wrap auth.ts functions
// TODO: consolidate with authV2.ts

import { hashPassword as oldHash, verifyPassword as oldVerify } from './auth';
import { Logger } from './utils';

// Re-export old auth functions with different names
export const createPasswordHash = oldHash;
export const checkPassword = oldVerify;

// Additional auth helpers

export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function isTokenExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1] || null;
}

export function parseBasicAuth(authHeader: string | undefined): { username: string; password: string } | null {
  if (!authHeader || !authHeader.startsWith('Basic ')) return null;
  const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
  const [username, password] = decoded.split(':');
  return { username, password };
}

// Used by webhook handler
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return signature === expected;
}

// TODO: this is duplicated from auth.ts
export function rotateToken(token: string): string {
  Logger.warn('rotateToken is deprecated, use authV2.refreshToken instead');
  return oldHash(token, 'rotate-salt');
}
