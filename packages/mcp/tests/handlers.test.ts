import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashContent } from "@atlas/hashing";
import { createProjectContainer } from "@atlas/sdk";
import { describe, expect, it } from "vitest";
import { CodeAtlasContext } from "../src/context";
import { HANDLERS, type HandlerContext } from "../src/handlers";
import { ToolDomainError, ToolInputError } from "../src/validation";
import { type Fixture, createFixture, silentLogger } from "./fixture";

function handlerContext(fx: Fixture): HandlerContext {
  return {
    ctx: new CodeAtlasContext({ root: fx.root }),
    logger: silentLogger(),
  };
}

/** Run `fn` against a fixture index, always releasing the SQLite handle. */
async function withFixture(fn: (ctx: HandlerContext) => Promise<void>): Promise<void> {
  const fx = createFixture();
  const ctx = handlerContext(fx);
  try {
    await fn(ctx);
  } finally {
    ctx.ctx.close();
    fx.cleanup();
  }
}

/** Run `fn` against a root with no index (domain-error paths). */
async function withEmptyRoot(fn: (ctx: HandlerContext) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "atlas-mcp-noidx-"));
  const ctx: HandlerContext = {
    ctx: new CodeAtlasContext({ root }),
    logger: silentLogger(),
  };
  try {
    await fn(ctx);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Run `fn` against a repo root that has a real file on disk (at `root/<relPath>`)
 * and an index entry for it (same content + matching hash), so version-aware
 * reads have a working tree to compare against.
 */
async function withOnDiskFile(
  relPath: string,
  content: string,
  fn: (ctx: HandlerContext) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "atlas-mcp-range-"));
  try {
    mkdirSync(join(root, ".codeatlas"), { recursive: true });
    const absolute = join(root, relPath);
    writeFileSync(absolute, content, "utf8");
    const container = createProjectContainer(join(root, ".codeatlas", "context.db"));
    try {
      container.getContextDb().saveContext({
        files: [{ path: absolute as never, language: "typescript", content }],
        hashes: { [absolute]: hashContent(content) },
      });
    } finally {
      container.getContextDb().close();
    }
    const ctx: HandlerContext = {
      ctx: new CodeAtlasContext({ root }),
      logger: silentLogger(),
    };
    try {
      await fn(ctx);
    } finally {
      ctx.ctx.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

interface SymbolHit {
  readonly name: string;
  readonly path: string | null;
  readonly symbolKind?: string;
  readonly documentation: string | null;
  readonly score: number;
}
interface SymbolSearchResult {
  readonly hits: readonly SymbolHit[];
  readonly total: number;
}

describe("search_symbols", () => {
  it("returns ranked symbol hits enriched with kind and documentation", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.search_symbols(ctx, {
        query: "double",
      })) as SymbolSearchResult;
      expect(result.total).toBeGreaterThan(0);
      const hit = result.hits.find((entry) => entry.name === "double");
      expect(hit).toBeDefined();
      expect(hit?.symbolKind).toBe("function");
      expect(hit?.path).toBe("/src/math.ts");
      expect(hit?.documentation).toContain("Docs for double");
    });
  });

  it("filters by symbol kind", async () => {
    await withFixture(async (ctx) => {
      const asClass = (await HANDLERS.search_symbols(ctx, {
        query: "double",
        kind: "class",
      })) as SymbolSearchResult;
      expect(asClass.total).toBe(0);

      const asFunction = (await HANDLERS.search_symbols(ctx, {
        query: "MathUtils",
        kind: "class",
      })) as SymbolSearchResult;
      expect(asFunction.hits[0]?.symbolKind).toBe("class");
    });
  });

  it("honors the limit", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.search_symbols(ctx, {
        query: "a",
        limit: 1,
      })) as SymbolSearchResult;
      expect(result.hits.length).toBeLessThanOrEqual(1);
    });
  });

  it("rejects a missing query", async () => {
    await withFixture(async (ctx) => {
      await expect(HANDLERS.search_symbols(ctx, {})).rejects.toThrow(ToolInputError);
      await expect(HANDLERS.search_symbols(ctx, {})).rejects.toThrow(/"query"/);
    });
  });

  it("fails cleanly when no index exists", async () => {
    await withEmptyRoot(async (ctx) => {
      await expect(HANDLERS.search_symbols(ctx, { query: "double" })).rejects.toThrow(
        ToolDomainError,
      );
      await expect(HANDLERS.search_symbols(ctx, { query: "double" })).rejects.toThrow(
        /No context index found/,
      );
    });
  });
});

describe("search_files", () => {
  it("returns file hits with detected language", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.search_files(ctx, { query: "auth" })) as {
        hits: ReadonlyArray<{
          path: string | null;
          language: string | undefined;
          score: number;
        }>;
        total: number;
      };
      const hit = result.hits.find((entry) => entry.path === "/src/auth.ts");
      expect(hit).toBeDefined();
      expect(hit?.language).toBe("typescript");
    });
  });

  it("matches file content", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.search_files(ctx, { query: "x * 2" })) as {
        hits: ReadonlyArray<{ path: string | null }>;
      };
      expect(result.hits.some((entry) => entry.path === "/src/math.ts")).toBe(true);
    });
  });

  it("rejects a missing query", async () => {
    await withFixture(async (ctx) => {
      await expect(HANDLERS.search_files(ctx, {})).rejects.toThrow(ToolInputError);
    });
  });
});

describe("get_summary", () => {
  it("returns a stored file summary", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.get_summary(ctx, {
        target: "/src/math.ts",
      })) as {
        found: boolean;
        generated: boolean;
        summaries: ReadonlyArray<{
          kind: string;
          target: string;
          overview: string;
        }>;
      };
      expect(result.found).toBe(true);
      expect(result.generated).toBe(false);
      expect(result.summaries[0]?.kind).toBe("file");
      expect(result.summaries[0]?.overview).toContain("Math utilities");
    });
  });

  it("reports a missing summary without erroring", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.get_summary(ctx, {
        target: "/src/missing.ts",
      })) as {
        found: boolean;
        message: string;
      };
      expect(result.found).toBe(false);
      expect(result.message).toContain("generate");
    });
  });

  it("matches the project summary by kind", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.get_summary(ctx, {
        target: "project",
      })) as {
        found: boolean;
        summaries: ReadonlyArray<{ kind: string; overview: string }>;
      };
      expect(result.found).toBe(true);
      expect(result.summaries[0]?.kind).toBe("project");
      expect(result.summaries[0]?.overview).toContain("demo project");
    });
  });

  it("honors the kind hint", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.get_summary(ctx, {
        target: "/src",
        kind: "module",
      })) as {
        found: boolean;
        summaries: ReadonlyArray<{ kind: string }>;
      };
      expect(result.found).toBe(true);
      expect(result.summaries[0]?.kind).toBe("module");
    });
  });

  it("fails cleanly when generating without a provider", async () => {
    const home = mkdtempSync(join(tmpdir(), "atlas-mcp-noprovider-"));
    const previousUserProfile = process.env["USERPROFILE"];
    const previousHome = process.env["HOME"];
    process.env["USERPROFILE"] = home;
    process.env["HOME"] = home;
    try {
      await withFixture(async (ctx) => {
        await expect(
          HANDLERS.get_summary(ctx, { target: "/src/nope.ts", generate: true }),
        ).rejects.toThrow(ToolDomainError);
        await expect(
          HANDLERS.get_summary(ctx, { target: "/src/nope.ts", generate: true }),
        ).rejects.toThrow(/Summary generation failed/);
      });
    } finally {
      if (previousUserProfile === undefined) {
        // biome-ignore lint/performance/noDelete: truly unset the env var; assigning undefined throws in Node >= 20.
        delete process.env["USERPROFILE"];
      } else {
        process.env["USERPROFILE"] = previousUserProfile;
      }
      if (previousHome === undefined) {
        // biome-ignore lint/performance/noDelete: truly unset the env var; assigning undefined throws in Node >= 20.
        delete process.env["HOME"];
      } else {
        process.env["HOME"] = previousHome;
      }
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("get_dependencies", () => {
  it("returns all persisted edges with labels", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.get_dependencies(ctx, {})) as {
        count: number;
        total: number;
        dependencies: ReadonlyArray<{
          fromLabel: string;
          toLabel: string;
          relation: string;
        }>;
      };
      expect(result.count).toBe(2);
      expect(result.total).toBe(2);
      expect(result.dependencies[0]?.relation).toBe("imports");
    });
  });

  it("filters by file-path node and direction", async () => {
    await withFixture(async (ctx) => {
      const outgoing = (await HANDLERS.get_dependencies(ctx, {
        node: "/src/math.ts",
        direction: "incoming",
      })) as {
        count: number;
        dependencies: ReadonlyArray<{ fromLabel: string }>;
      };
      expect(outgoing.count).toBe(1);
      expect(outgoing.dependencies[0]?.fromLabel).toBe("/src/auth.ts");
    });
  });

  it("resolves a symbol name to its node", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.get_dependencies(ctx, {
        node: "double",
        direction: "incoming",
      })) as { count: number; nodeFound: boolean };
      expect(result.nodeFound).toBe(true);
      expect(result.count).toBe(1);
    });
  });

  it("filters by relation kind", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.get_dependencies(ctx, {
        relation: "calls",
      })) as {
        count: number;
      };
      expect(result.count).toBe(1);
    });
  });

  it("reports when a node does not exist", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.get_dependencies(ctx, {
        node: "/src/nope.ts",
      })) as {
        count: number;
        nodeFound: boolean;
      };
      expect(result.nodeFound).toBe(false);
      expect(result.count).toBe(0);
    });
  });
});

describe("explain_module", () => {
  it("explains a folder with files, symbols, dependencies, and summary", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.explain_module(ctx, { path: "/src" })) as {
        fileCount: number;
        symbolCount: number;
        dependencyCount: number;
        module: { path: string; moduleType: string } | null;
        summary: { kind: string } | null;
      };
      expect(result.module?.path).toBe("/src");
      expect(result.module?.moduleType).toBe("folder");
      expect(result.fileCount).toBe(2);
      expect(result.symbolCount).toBe(3);
      expect(result.dependencyCount).toBe(2);
      expect(result.summary?.kind).toBe("module");
    });
  });

  it("can exclude the summary and dependencies", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.explain_module(ctx, {
        path: "/src",
        includeSummary: false,
        includeDependencies: false,
      })) as { summary: unknown; dependencies: unknown };
      expect(result.summary).toBeNull();
      expect(result.dependencies).toHaveLength(0);
    });
  });
});

describe("project_overview", () => {
  it("returns counts, languages, and the stored project summary", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.project_overview(ctx, {})) as {
        counts: Record<string, number>;
        languages: Record<string, number>;
        summary: { kind: string; overview: string } | null;
      };
      expect(result.counts).toEqual({
        files: 3,
        symbols: 3,
        modules: 1,
        dependencies: 2,
        summaries: 3,
      });
      expect(result.languages).toEqual({ typescript: 2, markdown: 1 });
      expect(result.summary?.kind).toBe("project");
    });
  });

  it("includes listings with detail full", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.project_overview(ctx, {
        detail: "full",
      })) as {
        modules: unknown[];
        topFiles: unknown[];
        topSymbols: unknown[];
      };
      expect(result.modules).toHaveLength(1);
      expect(result.topFiles).toHaveLength(3);
      expect(result.topSymbols).toHaveLength(3);
    });
  });

  it("omits the summary when includeSummary is false", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.project_overview(ctx, {
        includeSummary: false,
      })) as Record<string, unknown>;
      expect(result["summary"]).toBeUndefined();
    });
  });
});

describe("read_file_range", () => {
  it("blocks reads of secret files with a clear domain error (beta audit Fix 6)", async () => {
    // The deny check fires before any index or disk access, so an empty root
    // is enough: denied paths must fail closed regardless of index state.
    await withEmptyRoot(async (ctx) => {
      const denied = [
        "/repo/.env",
        "/repo/.env.production",
        "/repo/secrets.json",
        "/repo/.ssh/id_rsa",
        "/repo/certs/server.pem",
      ];
      for (const path of denied) {
        await expect(
          HANDLERS.read_file_range(ctx, { path, startLine: 1, endLine: 5 }),
        ).rejects.toThrow(ToolDomainError);
        await expect(
          HANDLERS.read_file_range(ctx, { path, startLine: 1, endLine: 5 }),
        ).rejects.toThrow(/deny list \(security policy\)/);
      }
    });
  });

  it("does not deny ordinary source files", async () => {
    await withEmptyRoot(async (ctx) => {
      // Ordinary paths pass the deny-filter; they then fail on the missing
      // index (ToolDomainError with a different message) — the point is that
      // the denial reason is not the security policy.
      await expect(
        HANDLERS.read_file_range(ctx, {
          path: "/repo/src/index.ts",
          startLine: 1,
          endLine: 5,
        }),
      ).rejects.toThrow(/No context index found/);
    });
  });

  it("rejects a missing path and missing line arguments", async () => {
    await withFixture(async (ctx) => {
      await expect(HANDLERS.read_file_range(ctx, {})).rejects.toThrow(/path/);
      await expect(
        HANDLERS.read_file_range(ctx, { path: "/src/auth.ts", startLine: 1 }),
      ).rejects.toThrow(/endLine/);
    });
  });

  it("rejects endLine before startLine", async () => {
    await withFixture(async (ctx) => {
      await expect(
        HANDLERS.read_file_range(ctx, {
          path: "/src/auth.ts",
          startLine: 10,
          endLine: 2,
        }),
      ).rejects.toThrow(/endLine/);
    });
  });

  it("falls back to indexed content and reports stale when the file is not on disk", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.read_file_range(ctx, {
        path: "/src/auth.ts",
        startLine: 1,
        endLine: 2,
        padding: 0,
      })) as {
        stale: boolean;
        content: string;
        versionMatch: boolean;
        padded: boolean;
      };
      expect(result.stale).toBe(true);
      expect(result.versionMatch).toBe(true);
      expect(result.padded).toBe(false);
      expect(result.content).toContain("login");
    });
  });

  it("reads a matching on-disk file and returns a fresh padded range", async () => {
    const content = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    await withOnDiskFile("file-range.ts", content, async (ctx) => {
      const result = (await HANDLERS.read_file_range(ctx, {
        path: join(ctx.ctx.root, "file-range.ts"),
        startLine: 8,
        endLine: 10,
        padding: 2,
      })) as {
        stale: boolean;
        versionMatch: boolean;
        startLine: number;
        endLine: number;
        content: string;
      };
      expect(result.stale).toBe(false);
      expect(result.versionMatch).toBe(true);
      expect(result.startLine).toBe(6);
      expect(result.endLine).toBe(12);
      expect(result.content).toContain("line 8");
      expect(result.content).toContain("line 10");
      expect(result.content).toContain("line 6");
    });
  });

  it("reports a version mismatch when the file changed since expectedHash", async () => {
    const before = "export const value = 1;\n";
    const after = "export const value = 1;\nexport const extra = 2;\n";
    await withOnDiskFile("version.ts", before, async (ctx) => {
      const path = join(ctx.ctx.root, "version.ts");
      const oldHash = (await HANDLERS.read_file_range(ctx, {
        path,
        startLine: 1,
        endLine: 1,
        padding: 0,
      })) as { hash: string };
      // The agent edited the file outside CodeAtlas.
      writeFileSync(path, after, "utf8");
      const result = (await HANDLERS.read_file_range(ctx, {
        path,
        startLine: 1,
        endLine: 2,
        padding: 0,
        expectedHash: oldHash.hash,
      })) as {
        stale: boolean;
        versionMatch: boolean;
        message?: string;
        content: string;
      };
      expect(result.stale).toBe(true);
      expect(result.versionMatch).toBe(false);
      expect(result.message).toContain("changed");
      expect(result.content).toContain("extra");
    });
  });
});

// ── analyze_task ────────────────────────────────────────────────────────────

describe("analyze_task", () => {
  it("classifies a debug task", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.analyze_task(ctx, {
        task: "Fix the crash in src/auth.ts when login fails",
      })) as {
        category: string;
        confidence: number;
        reasoning: string;
        entities: { filePaths: string[]; symbolNames: string[]; keywords: string[] };
        nextSteps: string[];
      };
      expect(result.category).toBe("debug");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.entities.filePaths).toContain("src/auth.ts");
      expect(result.nextSteps.length).toBeGreaterThan(0);
    });
  });

  it("classifies a security task", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.analyze_task(ctx, {
        task: "Fix the SQL injection vulnerability in the search endpoint",
      })) as { category: string };
      expect(result.category).toBe("security");
    });
  });

  it("extracts symbol names from the task", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.analyze_task(ctx, {
        task: "Fix `UserService.create` in src/user.ts",
      })) as { entities: { symbolNames: string[]; filePaths: string[] } };
      expect(result.entities.symbolNames).toContain("UserService");
      expect(result.entities.filePaths).toContain("src/user.ts");
    });
  });

  it("requires a task argument", async () => {
    await withFixture(async (ctx) => {
      await expect(HANDLERS.analyze_task(ctx, {})).rejects.toThrow(ToolInputError);
    });
  });
});

// ── create_plan ─────────────────────────────────────────────────────────────

describe("create_plan", () => {
  it("produces a plan with steps and impact set", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.create_plan(ctx, {
        task: "Fix the login bug",
      })) as {
        category: string;
        steps: Array<{ order: number; action: string; rationale: string }>;
        impactSet: string[];
        unknowns: string[];
        verificationStrategy: string;
        nextSteps: string[];
      };
      expect(result.category).toBe("debug");
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.impactSet.length).toBeGreaterThan(0);
      expect(result.verificationStrategy).toBeDefined();
      expect(result.nextSteps.length).toBeGreaterThan(0);
    });
  });

  it("includes steps with sequential order", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.create_plan(ctx, {
        task: "Fix the bug",
      })) as { steps: Array<{ order: number }> };
      for (let i = 0; i < result.steps.length; i++) {
        expect(result.steps[i]?.order).toBe(i + 1);
      }
    });
  });

  it("requires a task argument", async () => {
    await withFixture(async (ctx) => {
      await expect(HANDLERS.create_plan(ctx, {})).rejects.toThrow(ToolInputError);
    });
  });
});

// ── find_relevant_context ───────────────────────────────────────────────────

describe("find_relevant_context", () => {
  it("returns context items with sufficiency gate", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.find_relevant_context(ctx, {
        task: "Fix the double function",
      })) as {
        task: string;
        items: Array<{ id: string; kind: string; score: number }>;
        sufficient: boolean;
        sufficiencyFailures: Array<{ predicate: string; message: string }>;
        nextSteps: string[];
        budget: { itemsRequested: number; itemsIncluded: number; tokensEstimated: number };
      };
      expect(result.task).toBe("Fix the double function");
      expect(result.items.length).toBeGreaterThan(0);
      expect(typeof result.sufficient).toBe("boolean");
      expect(result.nextSteps.length).toBeGreaterThan(0);
      expect(result.budget.itemsIncluded).toBeGreaterThan(0);
    });
  });

  it("every item has required fields", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.find_relevant_context(ctx, {
        task: "Explain the math module",
      })) as {
        items: Array<{
          id: string;
          kind: string;
          title: string;
          score: number;
          source: string;
          reason: string;
          tokens: number;
        }>;
      };
      for (const item of result.items) {
        expect(item.id.length).toBeGreaterThan(0);
        expect(item.kind.length).toBeGreaterThan(0);
        expect(item.title.length).toBeGreaterThan(0);
        expect(item.score).toBeGreaterThanOrEqual(0);
        expect(item.source.length).toBeGreaterThan(0);
        expect(item.reason.length).toBeGreaterThan(0);
        expect(item.tokens).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it("supports budget customization", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.find_relevant_context(ctx, {
        task: "Fix the bug",
        maxItems: 3,
        maxTokens: 5000,
      })) as { items: unknown[]; budget: { itemsIncluded: number } };
      expect(result.items.length).toBeLessThanOrEqual(3);
      expect(result.budget.itemsIncluded).toBeLessThanOrEqual(3);
    });
  });

  it("requires a task argument", async () => {
    await withFixture(async (ctx) => {
      await expect(HANDLERS.find_relevant_context(ctx, {})).rejects.toThrow(ToolInputError);
    });
  });

  it("auto-escalate mode escalates only when the full pass satisfies the gate", async () => {
    await withFixture(async (ctx) => {
      const digest = (await HANDLERS.find_relevant_context(ctx, {
        task: "Fix the double function",
        contextMode: "digest",
      })) as {
        sufficient: boolean;
        escalated: boolean;
        items: Array<{ kind: string }>;
      };
      const auto = (await HANDLERS.find_relevant_context(ctx, {
        task: "Fix the double function",
        contextMode: "auto-escalate",
      })) as {
        task: string;
        items: Array<{ id: string; kind: string; score: number }>;
        sufficient: boolean;
        escalated: boolean;
        escalationFrom?: string;
        nextSteps: string[];
      };
      expect(auto.task).toBe("Fix the double function");
      expect(auto.items.length).toBeGreaterThan(0);
      // The result must always carry an explicit boolean escalation signal.
      expect(typeof digest.escalated).toBe("boolean");
      expect(typeof auto.escalated).toBe("boolean");
      // This small fixture produces digest-equivalent full packages, so the
      // digest pass is insufficient and the full pass is too — no escalation
      // happened, and auto-escalate must not claim one.
      expect(digest.sufficient).toBe(false);
      expect(auto.sufficient).toBe(false);
      expect(auto.escalated).toBe(false);
      expect(auto.escalationFrom).toBeUndefined();
      expect(auto.nextSteps.length).toBeGreaterThan(0);
    });
  });

  it("auto-escalate mode reports no escalation when the digest pass is insufficient", async () => {
    // Fixture note: the shared 3-file fixture is too small for digest vs full
    // to differ (both hit the same budget), so the sufficiency verdict is
    // identical and escalation cannot make it sufficient. The contract under
    // test is the observable signal, not the verdict: auto-escalate must NOT
    // claim an escalation that did not happen (regression for the
    // always-`escalated: true` bug).
    await withFixture(async (ctx) => {
      const digest = (await HANDLERS.find_relevant_context(ctx, {
        task: "Find all functions that call double",
        contextMode: "digest",
      })) as {
        sufficient: boolean;
        escalated: boolean;
        items: Array<{ kind: string }>;
      };
      const auto = (await HANDLERS.find_relevant_context(ctx, {
        task: "Find all functions that call double",
        contextMode: "auto-escalate",
      })) as {
        items: Array<{ kind: string }>;
        sufficient: boolean;
        escalated: boolean;
        escalationFrom?: string;
      };
      // Every result carries an explicit boolean escalation signal.
      expect(typeof digest.escalated).toBe("boolean");
      expect(typeof auto.escalated).toBe("boolean");
      expect(digest.escalated).toBe(false);
      // Non-auto-escalate modes never escalate.
      expect(auto.escalated).toBe(false);
      expect(auto.escalationFrom).toBeUndefined();
      // The auto-escalate package is what digest produced (nothing to escalate
      // from, identical verdicts on this fixture).
      expect(auto.items.length).toBe(digest.items.length);
      // All items should be files or symbols, not instructions-only.
      const nonInstructionItems = auto.items.filter((item) => item.kind !== "instructions");
      expect(nonInstructionItems.length).toBeGreaterThan(0);
    });
  });
});

// ── inspect_symbol ──────────────────────────────────────────────────────────

describe("inspect_symbol", () => {
  it("returns symbol details with callers and callees", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.inspect_symbol(ctx, {
        symbol: "double",
      })) as {
        symbol: { id: string; name: string; kind: string; filePath: string };
        callers: Array<{ name: string; edgeKind: string }>;
        callees: Array<{ name: string; edgeKind: string }>;
        testFiles: string[];
        nextSteps: string[];
      };
      expect(result.symbol.name).toBe("double");
      expect(result.symbol.kind).toBe("function");
      expect(result.symbol.filePath).toBe("/src/math.ts");
      expect(result.testFiles).toEqual([]);
      expect(result.nextSteps.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("finds callers via dependency edges", async () => {
    await withFixture(async (ctx) => {
      const result = (await HANDLERS.inspect_symbol(ctx, {
        symbol: "double",
      })) as { callers: Array<{ name: string; edgeKind: string }> };
      // login calls double via n:s2 -> n:s1 edge
      expect(result.callers.some((c) => c.name === "login")).toBe(true);
    });
  });

  it("throws when symbol is not found", async () => {
    await withFixture(async (ctx) => {
      await expect(
        HANDLERS.inspect_symbol(ctx, { symbol: "NonexistentThing12345" }),
      ).rejects.toThrow(ToolDomainError);
    });
  });

  it("requires a symbol argument", async () => {
    await withFixture(async (ctx) => {
      await expect(HANDLERS.inspect_symbol(ctx, {})).rejects.toThrow(ToolInputError);
    });
  });
});
