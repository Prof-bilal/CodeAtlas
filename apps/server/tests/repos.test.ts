import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  CommunityConfigError,
  checkAvailability,
  loadCommunityConfig,
  localEntryPath,
  repositoryStats,
  resolveRepository,
} from "../src/repos";

const tmp = mkdtempSync(join(tmpdir(), "atlas-server-repos-"));
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeConfig(name: string, data: unknown): string {
  const p = join(tmp, name);
  writeFileSync(p, JSON.stringify(data));
  return p;
}

describe("loadCommunityConfig", () => {
  it("loads a valid config", () => {
    const p = writeConfig("ok.json", {
      repositories: [
        { id: "a", name: "A", source: "local", path: "/tmp/a" },
        { id: "b", name: "B", source: "git", cloneUrl: "https://example.com/b.git" },
      ],
    });
    const config = loadCommunityConfig(p);
    expect(config.repositories).toHaveLength(2);
    expect(config.repositories[1]?.cloneUrl).toBe("https://example.com/b.git");
  });

  it("fails loud on malformed entries", () => {
    expect(() =>
      loadCommunityConfig(writeConfig("bad-id.json", { repositories: [{ name: "x" }] })),
    ).toThrow(CommunityConfigError);
    expect(() =>
      loadCommunityConfig(
        writeConfig("bad-source.json", { repositories: [{ id: "x", name: "x", source: "svn" }] }),
      ),
    ).toThrow(/source/i);
    expect(() =>
      loadCommunityConfig(
        writeConfig("bad-url.json", {
          repositories: [{ id: "x", name: "x", source: "git", cloneUrl: "http://insecure.git" }],
        }),
      ),
    ).toThrow(/https/i);
    expect(() =>
      loadCommunityConfig(
        writeConfig("dup.json", {
          repositories: [
            { id: "x", name: "x", source: "local", path: "/tmp" },
            { id: "x", name: "y", source: "local", path: "/tmp" },
          ],
        }),
      ),
    ).toThrow(/duplicate/i);
  });

  it("fails loud on non-JSON and missing files", () => {
    const p = join(tmp, "not-json.json");
    writeFileSync(p, "{nope");
    expect(() => loadCommunityConfig(p)).toThrow(CommunityConfigError);
    expect(() => loadCommunityConfig(join(tmp, "missing.json"))).toThrow(CommunityConfigError);
  });
});

describe("availability + resolution", () => {
  it("checks local availability on the filesystem", async () => {
    const dir = join(tmp, "repo-a");
    mkdirSync(dir, { recursive: true });
    const p = writeConfig("avail.json", {
      repositories: [{ id: "a", name: "A", source: "local", path: dir }],
    });
    const config = loadCommunityConfig(p);
    const first = config.repositories[0];
    expect(first).toBeDefined();
    const result = await checkAvailability(first, 1_000);
    expect(result.available).toBe(true);
    expect(result.checked).toBe("local-fs");
  });

  it("reports a local entry as unavailable when the path is missing", async () => {
    const p = writeConfig("gone.json", {
      repositories: [{ id: "g", name: "G", source: "local", path: join(tmp, "does-not-exist") }],
    });
    const config = loadCommunityConfig(p);
    const first = config.repositories[0];
    expect(first).toBeDefined();
    const result = await checkAvailability(first, 1_000);
    expect(result.available).toBe(false);
  });

  it("resolves a local entry and refuses a missing one", async () => {
    const dir = join(tmp, "repo-b");
    mkdirSync(dir, { recursive: true });
    const p = writeConfig("resolve.json", {
      repositories: [
        { id: "ok", name: "OK", source: "local", path: dir },
        { id: "gone", name: "Gone", source: "local", path: join(tmp, "nope") },
      ],
    });
    const config = loadCommunityConfig(p);
    const first = config.repositories[0];
    const second = config.repositories[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const resolved = await resolveRepository(first, 1_000);
    expect(resolved.path).toBe(localEntryPath(first));
    expect(resolved.temporary).toBe(false);
    await expect(resolveRepository(second, 1_000)).rejects.toThrow(/not available/i);
  });

  it("anchors relative local paths at the monorepo root", () => {
    const entry = { id: "r", name: "R", source: "local" as const, path: "packages/core" };
    const resolved = localEntryPath(entry);
    expect(resolved).toContain("packages/core");
    expect(resolved.startsWith("/")).toBe(true);
  });
});

describe("repositoryStats", () => {
  it("scans a repository without an index (real metadata, no invention)", async () => {
    const dir = join(tmp, "stats-repo");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "main.ts"), "export function main(): void {}\n");
    writeFileSync(join(dir, "README.md"), "# stats-repo\n");
    const stats = await repositoryStats(dir);
    expect(stats.files).toBeGreaterThanOrEqual(2);
    expect(stats.sizeBytes).toBeGreaterThan(0);
    expect(stats.scanned).toBe(true);
    expect(stats.symbols).toBeNull(); // no index — honestly unknown
    const langs = stats.languages ?? {};
    expect(Object.keys(langs).length).toBeGreaterThan(0);
  });

  it("returns nulls for a missing repository", async () => {
    const stats = await repositoryStats(join(tmp, "missing-repo"));
    expect(stats.files).toBeNull();
    expect(stats.languages).toBeNull();
  });
});
