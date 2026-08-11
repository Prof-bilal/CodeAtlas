import type { CacheKey, Result } from "@atlas/shared";

/** Generic caching contract used to avoid repeated expensive work. */
export interface CachePort {
  get<T>(key: CacheKey): Promise<Result<T | undefined>>;
  set<T>(key: CacheKey, value: T, ttlMs?: number): Promise<Result<void>>;
  delete(key: CacheKey): Promise<Result<void>>;
}
