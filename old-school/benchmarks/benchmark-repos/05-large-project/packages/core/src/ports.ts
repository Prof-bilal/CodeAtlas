import { Result } from '@atlas/shared';
export interface AuthPort { hashPassword(pw: string): Promise<Result<{ hash: string; salt: string }>>; verifyPassword(pw: string, hash: string, salt: string): Promise<Result<boolean>>; generateToken(payload: Record<string, unknown>): Promise<Result<string>>; }
export interface StoragePort { upload(key: string, data: Buffer, ct: string): Promise<Result<string>>; download(key: string): Promise<Result<Buffer>>; delete(key: string): Promise<Result<void>>; }
export interface EmailPort { send(to: string | string[], subject: string, html: string): Promise<Result<void>>; }
export interface PaymentPort { createPaymentIntent(amount: number, currency: string): Promise<Result<{ id: string; clientSecret: string }>>; confirmPayment(id: string): Promise<Result<{ status: string }>>; }
export interface SearchPort { index(idx: string, id: string, doc: Record<string, unknown>): Promise<Result<void>>; search(idx: string, query: string): Promise<Result<unknown[]>>; }
export interface CachePort { get<T>(key: string): Promise<Result<T | null>>; set<T>(key: string, value: T, ttl?: number): Promise<Result<void>>; delete(key: string): Promise<Result<void>>; }
export interface QueuePort { enqueue(type: string, payload: unknown): Promise<Result<string>>; process(type: string, handler: (p: unknown) => Promise<void>): Promise<Result<void>>; }