export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (!result.ok) return result.error;
  throw new Error('Called unwrapErr on an Ok result');
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

export function flatMap<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

export function and<T, U, E>(result: Result<T, E>, other: Result<U, E>): Result<U, E> {
  return result.ok ? other : result;
}

export function or<T, E, F>(result: Result<T, E>, other: Result<T, F>): Result<T, F> {
  return result.ok ? result : other;
}

export function forEach<T, E>(result: Result<T, E>, fn: (value: T) => void): void {
  if (result.ok) fn(result.value);
}

export function toPromise<T, E>(result: Result<T, E>): Promise<T> {
  return result.ok ? Promise.resolve(result.value) : Promise.reject(result.error);
}

export function fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  return promise.then(ok).catch(err);
}

export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}

export function any<T, E>(results: Result<T, E>[]): Result<T, E[]> {
  const errors: E[] = [];
  for (const result of results) {
    if (result.ok) return result;
    errors.push(result.error);
  }
  return err(errors);
}

export function fromNullable<T>(value: T | null | undefined, error: Error): Result<T, Error> {
  return value != null ? ok(value) : err(error);
}

export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
