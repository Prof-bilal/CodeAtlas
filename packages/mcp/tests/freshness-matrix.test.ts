import { mkdtempSync, rmSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexProject } from "@atlas/sdk";
import { describe, expect, it } from "vitest";
import { CodeAtlasContext } from "../src/context";
import { silentLogger } from "./fixture";

/**
 * Phase 5 event matrix (plan §17 Phase 5 Task 1): creation, modification,
 * deletion, rename, symbol-change, dependency-change, and restart must all
 * resolve to `fresh` after the auto-refresh path runs — never a silent stale
 * serve. Every report carries numeric `probeMs` (latency publication hook).
 */
async function buildRepo(): Promise<{ root: string; cleanup: () => void }> {
  const root = mkdtempSync(join(tmpdir(), "atlas-fresh-matrix-"));
  writeFileSync(join(root, "a.ts"), "export function aFn() { return 1; }\n");
  writeFileSync(
    join(root, "b.ts"),
    'import { aFn } from "./a";\nexport function bFn() { return aFn(); }\n',
  );
  const build = await indexProject({ repositoryPath: root, mode: "build" });
  expect(build.ok).toBe(true);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("freshness event matrix (Phase 5)", () => {
  it("create → fresh with changedFiles + probeMs", async () => {
    const { root, cleanup } = await buildRepo();
    const ctx = new CodeAtlasContext({ root });
    try {
      writeFileSync(join(root, "c.ts"), "export function cFn() { return 3; }\n");
      const report = await ctx.ensureFresh();
      expect(report.state).toBe("fresh");
      expect(report.refreshed).toBe(true);
      expect(report.changedFiles).toBeGreaterThanOrEqual(1);
      expect(typeof report.probeMs).toBe("number");
      // Second probe with no changes: fresh, no refresh.
      const again = await ctx.ensureFresh();
      expect(again.state).toBe("fresh");
      expect(again.refreshed).toBe(false);
    } finally {
      ctx.close();
      cleanup();
    }
    void silentLogger;
  });

  it("modify → fresh and symbol visible", async () => {
    const { root, cleanup } = await buildRepo();
    const ctx = new CodeAtlasContext({ root });
    try {
      writeFileSync(
        join(root, "a.ts"),
        "export function aFn() { return 1; }\nexport function aNew() { return 2; }\n",
      );
      const report = await ctx.ensureFresh();
      expect(report.state).toBe("fresh");
      expect(report.refreshed).toBe(true);
      const hits = ctx.requireSDK().symbols.searchSymbols("aNew", { limit: 5 });
      expect(hits.some((h) => h.title === "aNew")).toBe(true);
    } finally {
      ctx.close();
      cleanup();
    }
  });

  it("delete → fresh and file gone from search", async () => {
    const { root, cleanup } = await buildRepo();
    const ctx = new CodeAtlasContext({ root });
    try {
      unlinkSync(join(root, "b.ts"));
      const report = await ctx.ensureFresh();
      expect(report.state).toBe("fresh");
      const files = ctx
        .requireSDK()
        .files.listFiles()
        .map((f) => f.path);
      expect(files.some((p) => p.endsWith("b.ts"))).toBe(false);
    } finally {
      ctx.close();
      cleanup();
    }
  });

  it("rename → no ghost (old absent, new present)", async () => {
    const { root, cleanup } = await buildRepo();
    const ctx = new CodeAtlasContext({ root });
    try {
      renameSync(join(root, "a.ts"), join(root, "alpha.ts"));
      const report = await ctx.ensureFresh();
      expect(report.state).toBe("fresh");
      const files = ctx
        .requireSDK()
        .files.listFiles()
        .map((f) => f.path);
      expect(files.some((p) => p.endsWith("/a.ts"))).toBe(false);
      expect(files.some((p) => p.endsWith("/alpha.ts"))).toBe(true);
    } finally {
      ctx.close();
      cleanup();
    }
  });

  it("dependency-change → fresh and edges updated", async () => {
    const { root, cleanup } = await buildRepo();
    const ctx = new CodeAtlasContext({ root });
    try {
      writeFileSync(join(root, "c.ts"), "export function cFn() { return 3; }\n");
      writeFileSync(
        join(root, "b.ts"),
        'import { cFn } from "./c";\nexport function bFn() { return cFn(); }\n',
      );
      const report = await ctx.ensureFresh();
      expect(report.state).toBe("fresh");
      const { edges } = ctx.requireSDK().dependencies.query({ limit: 100 });
      const tos = edges.map((e) => e.to);
      expect(tos.some((t) => t.includes("c.ts"))).toBe(true);
    } finally {
      ctx.close();
      cleanup();
    }
  });

  it("restart (close → reopen) stays fresh with no ghost refresh", async () => {
    const { root, cleanup } = await buildRepo();
    const ctx = new CodeAtlasContext({ root });
    try {
      const first = await ctx.ensureFresh();
      expect(first.state).toBe("fresh");
      ctx.close();
      const second = await ctx.ensureFresh();
      expect(second.state).toBe("fresh");
      expect(typeof second.probeMs).toBe("number");
    } finally {
      ctx.close();
      cleanup();
    }
  });

  it("missing index → unavailable (never silent-stale)", async () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-fresh-empty-"));
    const ctx = new CodeAtlasContext({ root });
    try {
      const report = await ctx.ensureFresh();
      expect(report.state).toBe("unavailable");
      expect(report.refreshed).toBe(false);
    } finally {
      ctx.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
