/**
 * A minimal functional `Result` type used as the uniform return shape across
 * every port in CodeAtlas. It expresses success or failure without exceptions.
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Extract<Result<T, E>, { ok: true }> {
  return result.ok;
}
