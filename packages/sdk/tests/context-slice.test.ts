import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContextData, Symbol as CoreSymbol, SourceFile, Summary } from "@atlas/core";
import type { FilePath, NodeId, SymbolId } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTEXT_SLICE_SCHEMA_VERSION,
  type ContextIntegrationOptions,
  type ContextSDK,
  type ContextSlice,
  ContextSliceValidationError,
  buildContextSlice,
  contextSlicePaths,
  createContextIntegration,
  createContextSDK,
  listContextSlices,
  loadContextSlice,
  renderContextSlice,
  saveContextSlice,
  sliceId,
  validateContextSlice,
} from "../src/index";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function fixtureFile(path: string, content: string, language = "typescript"): SourceFile {
  return { path: path as FilePath, language, content };
}

function fixtureSymbol(
  id: string,
  name: string,
  filePath: string,
  kind: CoreSymbol["kind"] = "function",
): CoreSymbol {
  return {
    id: id as SymbolId,
    name,
    kind,
    filePath: filePath as FilePath,
    location: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 4 },
    parentId: null,
    visibility: "exported",
    exported: true,
    modifiers: ["export"],
    moduleSpecifier: null,
    typeText: null,
    documentation: null,
  };
}

function fixtureSummary(
  kind: Summary["kind"],
  target: string,
  overview: string,
  keyPoints: readonly string[],
): Summary {
  return {
    kind,
    target,
    content: { overview, keyPoints },
    metadata: {
      generatedAt: "2026-08-09T00:00:00.000Z",
      provider: "claude",
      model: "claude-sonnet-5",
      prompt: null,
      cacheHit: false,
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  };
}

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-slice-"));
  tempDirs.push(dir);
  return dir;
}

function standardData(): ContextData {
  return {
    files: [
      fixtureFile("/src/math.ts", "export function double(n: number) { return n * 2; }"),
      fixtureFile(
        "/src/auth.ts",
        "import { double } from './math';\nexport function login() { return double(2); }",
      ),
    ],
    symbols: [
      fixtureSymbol("s1", "double", "/src/math.ts", "function"),
      fixtureSymbol("s2", "login", "/src/auth.ts", "function"),
    ],
    dependencies: [
      { from: "n:s2" as NodeId, to: "n:s1" as NodeId, kind: "calls" },
      {
        from: "n:file:/src/auth.ts" as NodeId,
        to: "n:file:/src/math.ts" as NodeId,
        kind: "imports",
      },
    ],
    modules: [{ path: "/src", name: "src", moduleType: "folder" }],
    summaries: [fixtureSummary("project", "", "Demo project.", ["math", "auth"])],
  };
}

function withSdk(
  repositoryPath: string,
  data: ContextData,
  fn: (sdk: ContextSDK) => void | Promise<void>,
): Promise<void> {
  const sdk = createContextSDK({
    contextDb: new ContextStore({ filePath: ":memory:" }),
    repositoryPath,
  });
  sdk.write.save(data);
  return Promise.resolve(fn(sdk)).finally(() => sdk.close());
}

const FRESH = {
  state: "fresh" as const,
  available: true,
  lastUpdated: "2026-08-23T00:00:00.000Z",
  changed: [],
  added: [],
  deleted: [],
};

const STALE = {
  state: "stale" as const,
  available: true,
  lastUpdated: "2026-08-23T00:00:00.000Z",
  changed: ["/src/auth.ts"],
  added: [],
  deleted: [],
};

describe("buildContextSlice", () => {
  it("projects a package into a slice with stable provenance", async () => {
    const repo = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const slice = await buildContextSlice({
        context: sdk,
        task: "where is login implemented?",
        staleness: FRESH,
      });
      expect(slice.task).toBe("where is login implemented?");
      expect(slice.repository.name.length).toBeGreaterThan(0);
      expect(slice.repository.lastIndexedAt).toBe(FRESH.lastUpdated);
      expect(slice.tokens.method).toBe("estimated");
      expect(slice.tokens.estimated).toBe(slice.budget.tokensEstimated);
      expect(slice.retrieval.strategy).toBe("deterministic-v1");
      expect(slice.retrieval.latencyMs).toBeGreaterThanOrEqual(0);
      expect(slice.items.length).toBeGreaterThan(0);
      expect(slice.id).toMatch(/^[0-9a-f]{16}$/);
      // Slice items are a subset of the repository — never a whole-repo dump.
      expect(slice.items.length).toBeLessThan(sdk.project.stats().files + 5);
    });
  });

  it("derives the HEAD commit from .git when present, omits it otherwise", async () => {
    const repo = tempRepo();
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const gitDir = join(repo, ".git");
    mkdirSync(join(gitDir, "refs", "heads"), { recursive: true });
    writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(gitDir, "refs", "heads", "main"), `${sha}\n`);

    const bare = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const slice = await buildContextSlice({
        context: sdk,
        task: "anything",
        staleness: FRESH,
      });
      expect(slice.repository.commit).toBe(sha);
    });
    await withSdk(bare, standardData(), async (sdk) => {
      const slice = await buildContextSlice({
        context: sdk,
        task: "anything",
        staleness: FRESH,
      });
      expect(slice.repository.commit).toBeUndefined();
    });
  });

  it("keeps the id stable per {repo, task, budget} and varies with the budget", () => {
    const budget = { maxItems: 20, maxTokensPerItem: 2000, maxTokensTotal: 12000 };
    const a = sliceId("/repo", "task", budget);
    const b = sliceId("/repo", "task", budget);
    const c = sliceId("/repo", "task", { ...budget, maxTokensTotal: 6000 });
    const d = sliceId("/other", "task", budget);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it("never includes deny-filtered files; records the exclusion", async () => {
    const repo = tempRepo();
    const base = standardData();
    const data = {
      ...base,
      files: [...(base.files ?? []), fixtureFile("/.env", "API_KEY=supersecretvalue123")],
    };
    await withSdk(repo, data, async (sdk) => {
      const slice = await buildContextSlice({
        context: sdk,
        task: "env config login",
        staleness: FRESH,
        options: { includeInstructions: false, includeOverview: false },
      });
      const contents = slice.items.map((item) => item.content).join("\n");
      expect(contents).not.toContain("supersecretvalue123");
      expect(slice.items.some((item) => item.title === "/.env")).toBe(false);
      expect(slice.exclusions.droppedPaths).toContain("/.env");
    });
  });

  it("carries the staleness signal end-to-end", async () => {
    const repo = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const slice = await buildContextSlice({
        context: sdk,
        task: "login",
        staleness: STALE,
      });
      expect(slice.staleness.state).toBe("stale");
      const rendered = renderContextSlice(slice);
      expect(rendered).toContain("STALE");
      expect(rendered).toContain("atlas update");
    });
  });
});

describe("renderContextSlice", () => {
  it("renders a self-contained agent bundle with fences and provenance", async () => {
    const repo = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const slice = await buildContextSlice({
        context: sdk,
        task: "login implementation",
        staleness: FRESH,
      });
      const rendered = renderContextSlice(slice);
      expect(rendered).toContain("by CodeAtlas — do not edit");
      expect(rendered).toContain("login implementation");
      expect(rendered).toContain("deterministic-v1");
      expect(rendered).toContain("(estimated)");
      expect(rendered).toContain("## Ranked context");
      expect(rendered).toContain("```typescript");
      expect(rendered).toContain("## Budget");
    });
  });

  it("uses a fence longer than any backtick run inside the content", async () => {
    const repo = tempRepo();
    writeFileSync(join(repo, "AGENTS.md"), "# Rules\n\n```\nnested fence\n```\n");
    await withSdk(repo, standardData(), async (sdk) => {
      const slice = await buildContextSlice({
        context: sdk,
        task: "login",
        staleness: FRESH,
      });
      const rendered = renderContextSlice(slice);
      // The nested ``` inside AGENTS.md must not terminate the outer fence.
      expect(rendered).toContain("````markdown");
    });
  });
});

describe("slice persistence", () => {
  it("round-trips a slice through .codeatlas/slices/<id>.{json,md}", async () => {
    const repo = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const slice = await buildContextSlice({
        context: sdk,
        task: "login",
        staleness: FRESH,
      });
      const paths = await saveContextSlice(repo, slice);
      expect(existsSync(paths.jsonPath)).toBe(true);
      expect(existsSync(paths.markdownPath)).toBe(true);

      const document = JSON.parse(readFileSync(paths.jsonPath, "utf8"));
      expect(document.schemaVersion).toBe(CONTEXT_SLICE_SCHEMA_VERSION);

      const loaded = await loadContextSlice(repo, slice.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(slice.id);
      expect(loaded?.task).toBe(slice.task);
      expect(loaded?.items.map((item) => item.id)).toEqual(slice.items.map((item) => item.id));
      expect(loaded?.staleness.state).toBe("fresh");

      const listed = await listContextSlices(repo);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(slice.id);
      expect(listed[0]?.tokensEstimated).toBe(slice.tokens.estimated);
    });
  });

  it("rejects unsafe ids (path traversal) with a typed error", () => {
    const repo = tempRepo();
    expect(() => contextSlicePaths(repo, "../../etc/passwd")).toThrow(ContextSliceValidationError);
    expect(() => contextSlicePaths(repo, "ZZZZnot-hex")).toThrow(ContextSliceValidationError);
  });

  it("rejects corrupt and foreign slice files as untrusted input", async () => {
    const repo = tempRepo();
    const slicesDir = join(repo, ".codeatlas", "slices");
    mkdirSync(slicesDir, { recursive: true });

    writeFileSync(join(slicesDir, "aaaaaaaaaaaaaaaa.json"), "not json at all");
    writeFileSync(
      join(slicesDir, "bbbbbbbbbbbbbbbb.json"),
      JSON.stringify({ schemaVersion: 99, slice: {} }),
    );
    writeFileSync(
      join(slicesDir, "cccccccccccccccc.json"),
      JSON.stringify({
        schemaVersion: CONTEXT_SLICE_SCHEMA_VERSION,
        slice: { id: "cccccccccccccccc", task: 42 },
      }),
    );

    await expect(loadContextSlice(repo, "aaaaaaaaaaaaaaaa")).rejects.toThrow(
      ContextSliceValidationError,
    );
    await expect(loadContextSlice(repo, "bbbbbbbbbbbbbbbb")).rejects.toThrow(
      ContextSliceValidationError,
    );
    await expect(loadContextSlice(repo, "cccccccccccccccc")).rejects.toThrow(
      ContextSliceValidationError,
    );
    // Listing skips the corrupt entries instead of failing.
    expect(await listContextSlices(repo)).toEqual([]);
  });

  it("validates a well-formed slice object", async () => {
    const repo = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const slice = await buildContextSlice({
        context: sdk,
        task: "login",
        staleness: FRESH,
      });
      const validated = validateContextSlice(JSON.parse(JSON.stringify(slice)));
      expect(validated.id).toBe(slice.id);
      expect(validated.items).toHaveLength(slice.items.length);
    });
  });
});

describe("ContextIntegration.buildSlice", () => {
  it("builds a slice through the integration façade", async () => {
    const repo = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const integration = createContextIntegration({
        context: sdk,
        sessions: fakeSessions(),
      });
      const slice: ContextSlice = await integration.buildSlice({ task: "login" });
      expect(slice.id).toMatch(/^[0-9a-f]{16}$/);
      expect(slice.items.length).toBeGreaterThan(0);
    });
  });
});

/** A minimal SessionPort stub — slices never start sessions. */
function fakeSessions(): ContextIntegrationOptions["sessions"] {
  const sessions = [] as unknown[];
  return {
    createSession: () =>
      ({
        id: "s",
        agentId: "claude",
        provider: "claude",
        repositoryPath: "/",
        status: "CREATED",
        startedAt: 0,
      }) as never,
    startSession: () => ({ ok: true, value: sessions[0] }) as never,
    getSession: () => undefined,
    listSessions: () => sessions as never,
    stopSession: () => ({ ok: true }) as never,
    getSessionOutput: () => undefined,
  } as never;
}
