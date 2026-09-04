// Helper 63 - Utility functions

import * as crypto from 'crypto';

export function helper63_hash(data: string, algorithm: string = 'sha256'): string {
  return crypto.createHash(algorithm).update(data).digest('hex');
}

export function helper63_hmac(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function helper63_generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function helper63_validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function helper63_slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function helper63_truncate(str: string, maxLen: number, suffix: string = '...'): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - suffix.length) + suffix;
}

export function helper63_capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function helper63_camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
}

export function helper63_snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// TODO: consolidate all helpers
