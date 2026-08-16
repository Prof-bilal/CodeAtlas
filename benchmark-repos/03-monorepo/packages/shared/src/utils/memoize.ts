export interface MemoizeOptions {
  maxSize?: number;
  ttlMs?: number;
  keyFn?: (...args: unknown[]) => string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt?: Date;
  lastAccessed: Date;
}

export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: MemoizeOptions = {}
): T {
  const cache = new Map<string, CacheEntry<ReturnType<T>>>();
  const maxSize = options.maxSize || 100;
  const ttlMs = options.ttlMs;
  const keyFn = options.keyFn || ((...args) => JSON.stringify(args));

  function getCacheKey(...args: unknown[]): string {
    return keyFn(...args);
  }

  function cleanup(): void {
    const now = new Date();
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        cache.delete(key);
      }
    }
    while (cache.size > maxSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of cache.entries()) {
        if (entry.lastAccessed.getTime() < oldestTime) {
          oldestTime = entry.lastAccessed.getTime();
          oldestKey = key;
        }
      }
      if (oldestKey) cache.delete(oldestKey);
    }
  }

  const memoized = function (this: unknown, ...args: unknown[]): ReturnType<T> {
    const key = getCacheKey(...args);
    const entry = cache.get(key);
    if (entry) {
      if (entry.expiresAt && new Date() > entry.expiresAt) {
        cache.delete(key);
      } else {
        entry.lastAccessed = new Date();
        return entry.value;
      }
    }
    const result = fn.apply(this, args) as ReturnType<T>;
    cache.set(key, {
      value: result,
      expiresAt: ttlMs ? new Date(Date.now() + ttlMs) : undefined,
      lastAccessed: new Date(),
    });
    cleanup();
    return result;
  } as T;

  (memoized as unknown as { cache: Map<string, CacheEntry<ReturnType<T>>> }).cache = cache;
  (memoized as unknown as { clearCache: () => void }).clearCache = () => cache.clear();
  (memoized as unknown as { getCacheSize: () => number }).getCacheSize = () => cache.size;

  return memoized;
}

export function memoizeAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: MemoizeOptions = {}
): T {
  const cache = new Map<string, { promise: Promise<ReturnType<T>>; expiresAt?: Date }>();
  const maxSize = options.maxSize || 100;
  const ttlMs = options.ttlMs;
  const keyFn = options.keyFn || ((...args) => JSON.stringify(args));

  const memoized = async function (this: unknown, ...args: unknown[]): Promise<ReturnType<T>> {
    const key = keyFn(...args);
    const entry = cache.get(key);
    if (entry) {
      if (entry.expiresAt && new Date() > entry.expiresAt) {
        cache.delete(key);
      } else {
        return entry.promise;
      }
    }
    const promise = fn.apply(this, args) as Promise<ReturnType<T>>;
    cache.set(key, {
      promise,
      expiresAt: ttlMs ? new Date(Date.now() + ttlMs) : undefined,
    });
    while (cache.size > maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    return promise;
  } as T;

  (memoized as unknown as { cache: Map<string, unknown> }).cache = cache;
  (memoized as unknown as { clearCache: () => void }).clearCache = () => cache.clear();
  return memoized;
}
