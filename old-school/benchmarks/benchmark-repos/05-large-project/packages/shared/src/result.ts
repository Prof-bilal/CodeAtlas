export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export function Ok<T>(value: T): Result<T, never> { return { ok: true, value }; }
export function Err<E>(error: E): Result<never, E> { return { ok: false, error }; }
export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } { return r.ok; }
export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } { return !r.ok; }
export function unwrap<T>(r: Result<T, unknown>): T { if (!r.ok) throw r.error; return r.value; }
export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> { return r.ok ? Ok(fn(r.value)) : r; }
export function flatMap<T, U, E>(r: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> { return r.ok ? fn(r.value) : r; }
export function mapErr<T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> { return r.ok ? r : Err(fn(r.error)); }
export function all<T>(results: Result<T, unknown>[]): Result<T[], unknown> { for (const r of results) if (!r.ok) return r; return Ok(results.map(r => (r as any).value)); }
export function fromTry<T>(fn: () => T): Result<T, Error> { try { return Ok(fn()); } catch (e) { return Err(e as Error); } }
export async function fromAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> { try { return Ok(await fn()); } catch (e) { return Err(e as Error); } }