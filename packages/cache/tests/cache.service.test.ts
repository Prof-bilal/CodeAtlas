import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CacheKey } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { CacheService } from "../src/cache.service";

const key = (k: string): CacheKey => k as CacheKey;

describe("CacheService", () => {
  it("stores and retrieves values", async () => {
    const cache = new CacheService();
    await cache.set(key("a"), { hello: 1 });
    const result = await cache.get<{ hello: number }>(key("a"));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toEqual({ hello: 1 });
  });

  it("returns undefined for a missing or deleted key", async () => {
    const cache = new CacheService();
    const missing = await cache.get(key("nope"));
    expect(missing.ok).toBe(true);
    if (!missing.ok) {
      return;
    }
    expect(missing.value).toBeUndefined();

    await cache.set(key("a"), 1);
    await cache.delete(key("a"));
    const after = await cache.get(key("a"));
    expect(after.ok).toBe(true);
    if (!after.ok) {
      return;
    }
    expect(after.value).toBeUndefined();
  });

  it("expires entries after their TTL", async () => {
    const cache = new CacheService();
    await cache.set(key("a"), 1, 10);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const result = await cache.get(key("a"));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toBeUndefined();
  });

  it("applies the default TTL when no explicit TTL is given", async () => {
    const cache = new CacheService({ defaultTtlMs: 10 });
    await cache.set(key("a"), 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const result = await cache.get(key("a"));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toBeUndefined();
  });

  it("persists entries to a JSON file and reloads them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-cache-"));
    try {
      const filePath = join(dir, "cache.json");
      const first = new CacheService({ filePath });
      await first.set(key("a"), { value: 42 });
      expect(await readFile(filePath, "utf8")).toContain("42");

      const second = new CacheService({ filePath });
      const result = await second.get<{ value: number }>(key("a"));
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value).toEqual({ value: 42 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
