import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createProjectContainer } from "@atlas/sdk";
import type { FilePath } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { CodeAtlasContext, resolveContextConfig } from "../src/context";
import { ToolDomainError } from "../src/validation";

describe("resolveContextConfig", () => {
  it("defaults to <root>/.codeatlas/context.db for an explicit root", () => {
    const root = resolve("C:/some/project");
    const config = resolveContextConfig({ root });
    expect(config.root).toBe(root);
    expect(config.dbPath).toBe(join(root, ".codeatlas", "context.db"));
  });

  it("lets an explicit dbPath win", () => {
    const config = resolveContextConfig({ root: "C:/some/project", dbPath: "C:/tmp/other.db" });
    expect(config.dbPath).toBe(resolve("C:/tmp/other.db"));
  });

  it("honors ATLAS_ROOT and ATLAS_DB env vars", () => {
    const previousRoot = process.env["ATLAS_ROOT"];
    const previousDb = process.env["ATLAS_DB"];
    try {
      process.env["ATLAS_ROOT"] = "C:/env/root";
      process.env["ATLAS_DB"] = "C:/env/db/context.db";
      const config = resolveContextConfig();
      expect(config.root).toBe(resolve("C:/env/root"));
      expect(config.dbPath).toBe(resolve("C:/env/db/context.db"));
    } finally {
      restoreEnv(previousRoot, previousDb);
    }
  });
});

describe("CodeAtlasContext", () => {
  it("is not ready and refuses to open when no index exists", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-mcp-empty-"));
    try {
      const ctx = new CodeAtlasContext({ root });
      expect(ctx.isReady).toBe(false);
      expect(ctx.open()).toBeNull();
      expect(() => ctx.requireSDK()).toThrow(ToolDomainError);
      expect(() => ctx.requireSDK()).toThrow(/No context index found/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("opens lazily once the index appears and can be closed and reopened", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-mcp-lazy-"));
    try {
      const ctx = new CodeAtlasContext({ root });
      expect(ctx.isReady).toBe(false);

      // Build the index while the server context already exists.
      mkdirSync(join(root, ".codeatlas"), { recursive: true });
      const container = createProjectContainer(join(root, ".codeatlas", "context.db"));
      container.getContextDb().saveContext({
        files: [
          { path: "/x.ts" as FilePath, language: "typescript", content: "export const x = 1;" },
        ],
      });
      container.getContextDb().close();

      expect(ctx.isReady).toBe(true);
      expect(ctx.open()).not.toBeNull();
      ctx.close();
      expect(ctx.open()).not.toBeNull();
      ctx.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports the resolved db path", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-mcp-path-"));
    try {
      const ctx = new CodeAtlasContext({ root });
      expect(ctx.dbPath).toBe(join(root, ".codeatlas", "context.db"));
      expect(ctx.root).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function restoreEnv(previousRoot: string | undefined, previousDb: string | undefined): void {
  if (previousRoot === undefined) {
    process.env["ATLAS_ROOT"] = undefined;
  } else {
    process.env["ATLAS_ROOT"] = previousRoot;
  }
  if (previousDb === undefined) {
    process.env["ATLAS_DB"] = undefined;
  } else {
    process.env["ATLAS_DB"] = previousDb;
  }
}
