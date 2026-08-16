import { createHash, createHmac, randomBytes } from 'crypto';
export async function sha256(data: string): Promise<string> { return createHash('sha256').update(data).digest('hex'); }
export async function sha512(data: string): Promise<string> { return createHash('sha512').update(data).digest('hex'); }
export async function hmacSha256(data: string, secret: string): Promise<string> { return createHmac('sha256', secret).update(data).digest('hex'); }
export function generateSalt(length = 16): string { return randomBytes(length).toString('hex'); }
export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> { const s = salt ?? generateSalt(); return { hash: createHash('sha256').update(s+password).digest('hex'), salt: s }; }
export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> { return (await hashPassword(password, salt)).hash === hash; }
export function generateApiKey(): string { return 'ak_'+randomBytes(32).toString('hex'); }