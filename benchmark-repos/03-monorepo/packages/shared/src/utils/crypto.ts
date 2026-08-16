import { createHash, randomBytes, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(password + usedSalt)
    .digest('hex');
  return { hash, salt: usedSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const result = hashPassword(password, salt);
  return result.hash === hash;
}

export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

export function generateApiKey(): string {
  const prefix = 'mk';
  const key = randomBytes(24).toString('base64url');
  return `${prefix}_${key}`;
}

export function hmacSign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function hmacVerify(data: string, secret: string, signature: string): boolean {
  const expected = hmacSign(data, secret);
  return expected === signature;
}

export function encrypt(text: string, secret: string): { iv: string; encrypted: string; tag: string } {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    encrypted,
    tag: tag.toString('hex'),
  };
}

export function decrypt(ivHex: string, encrypted: string, tagHex: string, secret: string): string {
  const key = createHash('sha256').update(secret).digest();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function generateRandomString(length: number, charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

export function generateUuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function sha512(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
