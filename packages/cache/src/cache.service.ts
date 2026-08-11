import type { CachePort } from "@atlas/core";
import type { CacheKey, Result } from "@atlas/shared";
import { ok } from "@atlas/shared";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** A stored value plus its optional expiry (epoch ms). */
interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt: number | null;
}

/** Options for constructing a {@link CacheService}. */
export interface CacheServiceOptions {
  /**
   * Persist the cache to this JSON file. The file is loaded lazily on first
   * access and rewritten on every write; persistence is best-effort and the
   * in-memory cache stays authoritative within the process.
   */
  readonly filePath?: string;
  /** Default TTL (ms) for entries written without an explicit TTL. */
  readonly defaultTtlMs?: number;
}

/**
 * In-memory cache behind the `CachePort` contract, with optional JSON file
 * persistence and per-entry TTL expiry.
 */
export class CacheService implements CachePort {
  private readonly store = new Map<CacheKey, CacheEntry>();
  private readonly filePath: string | undefined;
  private readonly defaultTtlMs: number | undefined;
  private loaded = false;

  public constructor(options: CacheServiceOptions = {}) {
    this.filePath = options.filePath;
    this.defaultTtlMs = options.defaultTtlMs;
  }

  public async get<T>(key: CacheKey): Promise<Result<T | undefined>> {
    await this.ensureLoaded();
    const entry = this.store.get(key);
    if (entry === undefined) {
      return ok(undefined);
    }
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return ok(undefined);
    }
    return ok(entry.value as T);
  }

  public async set<T>(key: CacheKey, value: T, ttlMs?: number): Promise<Result<void>> {
    await this.ensureLoaded();
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: ttl === undefined ? null : Date.now() + ttl,
    });
    await this.persist();
    return ok(undefined);
  }

  public async delete(key: CacheKey): Promise<Result<void>> {
    await this.ensureLoaded();
    this.store.delete(key);
    await this.persist();
    return ok(undefined);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded || this.filePath === undefined) {
      return;
    }
    this.loaded = true;
    try {
      const text = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(text) as { entries?: Record<string, CacheEntry> };
      const entries = parsed?.entries ?? {};
      for (const [key, entry] of Object.entries(entries)) {
        this.store.set(key as CacheKey, entry);
      }
    } catch {
      // Missing or corrupt file: start with an empty cache.
    }
  }

  private async persist(): Promise<void> {
    if (this.filePath === undefined) {
      return;
    }
    const payload = { version: 1, entries: Object.fromEntries(this.store) };
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // Best-effort persistence: the in-memory cache stays authoritative.
    }
  }
}
