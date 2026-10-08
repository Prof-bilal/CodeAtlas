import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashContent } from "@prof-bilal/atlas-hashing";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ContextPackage,
  MAX_FILES_TOUCHED,
  MAX_TASK_FILE_BYTES,
  MAX_TASK_OUTPUT_CHARS,
  type TaskLedger,
  TaskLedgerNotFoundError,
  TaskLedgerValidationError,
  type TaskSessionRecord,
  boundProgress,
  computeFilesTouched,
  createTaskLedgerDocument,
  emptyProgress,
  findTaskLedgerBySessionId,
  listTaskLedgers,
  loadTaskLedger,
  relativeHashes,
  renderHandoffPrompt,
  renderHandoffSection,
  resolveTaskLedger,
  sanitizeTaskProgress,
  saveTaskLedger,
  validateTaskLedger,
  withTaskSession,
} from "../src/index";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-task-ledger-"));
  tempDirs.push(dir);
  return dir;
}

function validLedgerJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: "0123456789abcdef",
    task: "fix auth",
    repositoryPath: "/repo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sessions: [],
    progress: {
      lastOutput: "",
      lastOutputTruncated: false,
      filesTouched: [],
      filesTouchedTruncated: false,
      filesTouchedUnknown: true,
      transcriptAvailable: false,
    },
    hashSnapshotAtStart: { hashes: {} },
    ...overrides,
  };
}

function sessionRow(index: number, provider = "claude"): TaskSessionRecord {
  return {
    sessionId: `sess-${index}`,
    provider,
    model: null,
    status: "STOPPED",
    startedAt: index,
    endedAt: index + 1,
  };
}

function packageStub(task: string): ContextPackage {
  return {
    task,
    items: [],
    truncated: false,
    staleness: {
      state: "fresh",
      available: true,
      lastUpdated: "",
      changed: [],
      added: [],
      deleted: [],
    },
    budget: {
      budget: { maxItems: 20, maxTokensPerItem: 2000, maxTokensTotal: 12000 },
      itemsRequested: 0,
      itemsIncluded: 0,
      tokensEstimated: 0,
      itemsTruncated: [],
      droppedByTokens: [],
      itemsDroppedByCount: [],
      budgetExceeded: false,
    },
    exclusions: { droppedPaths: [], droppedPatterns: [] },
  };
}

describe("task ledger store", () => {
  it("round-trips a valid ledger", async () => {
    const repo = tempRepo();
    const ledger = createTaskLedgerDocument({
      task: "fix auth",
      repositoryPath: repo,
      hashes: { "src/auth.ts": "abc" },
    });
    await saveTaskLedger(repo, ledger);
    const loaded = await loadTaskLedger(repo, ledger.id);
    expect(loaded).toEqual(ledger);
    const listed = await listTaskLedgers(repo);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(ledger.id);
    expect(listed[0]?.task).toBe("fix auth");
  });

  it("rejects hostile ids and invalid JSON", async () => {
    const repo = tempRepo();
    await expect(loadTaskLedger(repo, "../secret")).rejects.toBeInstanceOf(
      TaskLedgerValidationError,
    );
    await expect(loadTaskLedger(repo, "__proto__")).rejects.toBeInstanceOf(
      TaskLedgerValidationError,
    );
    expect(() => validateTaskLedger({ schemaVersion: 1 })).toThrow(TaskLedgerValidationError);
    expect(() => validateTaskLedger({ schemaVersion: 99, id: "0123456789abcdef" })).toThrow(
      TaskLedgerValidationError,
    );
  });

  it("skips corrupt files when listing", async () => {
    const repo = tempRepo();
    const dir = join(repo, ".codeatlas", "tasks");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "0123456789abcdef.json"), "{not json", "utf8");
    await expect(listTaskLedgers(repo)).resolves.toEqual([]);
  });

  it("computes filesTouched from a hash delta", async () => {
    const repo = tempRepo();
    const file = join(repo, "src.ts");
    writeFileSync(file, "one", "utf8");
    const startHash = hashContent("one");
    writeFileSync(file, "two", "utf8");
    const delta = await computeFilesTouched(repo, { hashes: { [file]: startHash } });
    expect(delta.unknown).toBe(false);
    expect(delta.filesTouched.some((path) => path.endsWith("src.ts"))).toBe(true);
  });
});

describe("handoff render", () => {
  it("drops deny-listed paths and redacts secret-bearing output", () => {
    const progress = sanitizeTaskProgress({
      lastOutput: "token = sk-abcdefghijklmnopqrstuvwxyz012345",
      lastOutputTruncated: false,
      filesTouched: ["src/auth.ts", ".env"],
      filesTouchedTruncated: false,
      filesTouchedUnknown: false,
      transcriptAvailable: true,
    });
    expect(progress.filesTouched).toEqual(["src/auth.ts"]);
    expect(progress.lastOutput).toBe("");
    expect(progress.transcriptAvailable).toBe(false);
  });

  it("states when the prior transcript is missing", () => {
    const ledger = createTaskLedgerDocument({
      task: "fix auth",
      repositoryPath: "/repo",
    });
    const text = renderHandoffSection(ledger);
    expect(text).toContain("# Handoff");
    expect(text).toContain("Prior model transcript is not available");
    expect(text).toContain("fix auth");
  });
});

describe("task ledger store — edge cases", () => {
  it("returns null for a well-formed id that has no file", async () => {
    const repo = tempRepo();
    await expect(loadTaskLedger(repo, "0123456789abcdef")).resolves.toBeNull();
  });

  it("rejects uppercase and too-short ids before touching disk", async () => {
    const repo = tempRepo();
    await expect(loadTaskLedger(repo, "0123456789ABCDEF")).rejects.toBeInstanceOf(
      TaskLedgerValidationError,
    );
    await expect(loadTaskLedger(repo, "abcd")).rejects.toBeInstanceOf(TaskLedgerValidationError);
    await expect(loadTaskLedger(repo, "0123456789abcdef0")).rejects.toBeInstanceOf(
      TaskLedgerValidationError,
    );
  });

  it("rejects a file whose embedded id does not match the filename", async () => {
    const repo = tempRepo();
    const dir = join(repo, ".codeatlas", "tasks");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "0123456789abcdef.json"),
      `${JSON.stringify(validLedgerJson({ id: "fedcba9876543210" }))}\n`,
      "utf8",
    );
    await expect(loadTaskLedger(repo, "0123456789abcdef")).rejects.toBeInstanceOf(
      TaskLedgerValidationError,
    );
  });

  it("rejects an oversized task file", async () => {
    const repo = tempRepo();
    const dir = join(repo, ".codeatlas", "tasks");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "0123456789abcdef.json"), "x".repeat(MAX_TASK_FILE_BYTES + 1), "utf8");
    await expect(loadTaskLedger(repo, "0123456789abcdef")).rejects.toThrow(/byte bound/);
  });

  it("rejects prototype-pollution shaped JSON and non-objects", () => {
    expect(() => validateTaskLedger(null)).toThrow(TaskLedgerValidationError);
    expect(() => validateTaskLedger([])).toThrow(TaskLedgerValidationError);
    expect(() => validateTaskLedger("ledger")).toThrow(TaskLedgerValidationError);
    expect(() =>
      validateTaskLedger({
        ...validLedgerJson(),
        hashSnapshotAtStart: { hashes: { "../etc/passwd": "abc" } },
      }),
    ).toThrow(/unsafe hash path/);
  });

  it("rejects more than 50 sessions and invalid session rows", () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => sessionRow(i));
    expect(() => validateTaskLedger(validLedgerJson({ sessions: tooMany }))).toThrow(
      TaskLedgerValidationError,
    );
    expect(() =>
      validateTaskLedger(validLedgerJson({ sessions: [{ sessionId: "", provider: "claude" }] })),
    ).toThrow(TaskLedgerValidationError);
    expect(() =>
      validateTaskLedger(
        validLedgerJson({ sessions: [{ sessionId: "s1", provider: "claude", status: 1 }] }),
      ),
    ).toThrow(TaskLedgerValidationError);
  });

  it("caps in-memory session history at 50 rows", () => {
    let ledger = createTaskLedgerDocument({ task: "t", repositoryPath: "/r" });
    for (let i = 0; i < 55; i += 1) {
      ledger = withTaskSession(ledger, sessionRow(i));
    }
    expect(ledger.sessions).toHaveLength(50);
    expect(ledger.sessions[0]?.sessionId).toBe("sess-5");
    expect(ledger.sessions[49]?.sessionId).toBe("sess-54");
  });

  it("truncates oversized lastOutput and filesTouched", () => {
    const files = Array.from({ length: MAX_FILES_TOUCHED + 10 }, (_, i) => `f${i}.ts`);
    const bounded = boundProgress({
      ...emptyProgress(),
      lastOutput: "a".repeat(MAX_TASK_OUTPUT_CHARS + 50),
      lastOutputTruncated: false,
      filesTouched: files,
      filesTouchedTruncated: false,
      filesTouchedUnknown: false,
      transcriptAvailable: true,
    });
    expect(bounded.lastOutput).toHaveLength(MAX_TASK_OUTPUT_CHARS);
    expect(bounded.lastOutputTruncated).toBe(true);
    expect(bounded.filesTouched).toHaveLength(MAX_FILES_TOUCHED);
    expect(bounded.filesTouchedTruncated).toBe(true);
    expect(bounded.transcriptAvailable).toBe(true);
  });

  it("clears transcriptAvailable when output is only whitespace", () => {
    const bounded = boundProgress({
      ...emptyProgress(),
      lastOutput: "   \n",
      transcriptAvailable: true,
      filesTouchedUnknown: false,
    });
    expect(bounded.transcriptAvailable).toBe(false);
  });

  it("resolves a ledger by session id and fails closed when neither matches", async () => {
    const repo = tempRepo();
    const ledger = withTaskSession(
      createTaskLedgerDocument({ task: "fix auth", repositoryPath: repo }),
      sessionRow(1, "gemini"),
    );
    await saveTaskLedger(repo, ledger);

    await expect(resolveTaskLedger(repo, ledger.id)).resolves.toMatchObject({ id: ledger.id });
    await expect(resolveTaskLedger(repo, "sess-1")).resolves.toMatchObject({ id: ledger.id });
    await expect(findTaskLedgerBySessionId(repo, "sess-1")).resolves.toMatchObject({
      id: ledger.id,
    });
    await expect(findTaskLedgerBySessionId(repo, "missing")).resolves.toBeNull();
    await expect(resolveTaskLedger(repo, "no-such")).rejects.toBeInstanceOf(
      TaskLedgerNotFoundError,
    );
  });

  it("treats an empty start snapshot as unknown files-touched", async () => {
    const repo = tempRepo();
    const delta = await computeFilesTouched(repo, { hashes: {} });
    expect(delta).toEqual({ filesTouched: [], truncated: false, unknown: true });
  });

  it("reports deleted files in the hash delta and nothing when content is unchanged", async () => {
    const repo = tempRepo();
    const gone = join(repo, "gone.ts");
    const kept = join(repo, "kept.ts");
    writeFileSync(gone, "delete-me", "utf8");
    writeFileSync(kept, "stable", "utf8");
    const start = {
      hashes: { [gone]: hashContent("delete-me"), [kept]: hashContent("stable") },
    };
    unlinkSync(gone);
    const delta = await computeFilesTouched(repo, start);
    expect(delta.unknown).toBe(false);
    expect(delta.filesTouched.some((path) => path.endsWith("gone.ts"))).toBe(true);
    expect(delta.filesTouched.some((path) => path.endsWith("kept.ts"))).toBe(false);

    const unchanged = await computeFilesTouched(repo, {
      hashes: { [kept]: hashContent("stable") },
    });
    expect(unchanged.unknown).toBe(false);
    expect(unchanged.filesTouched).toEqual([]);
  });

  it("stores snapshot keys as repo-relative paths and skips empty hashes", () => {
    const repo = "/tmp/project";
    const hashes = relativeHashes(repo, {
      "/tmp/project/src/a.ts": "aaa",
      "src/b.ts": "bbb",
      "src/c.ts": "",
    });
    expect(hashes["src/a.ts"]).toBe("aaa");
    expect(hashes["src/b.ts"]).toBe("bbb");
    expect(hashes["src/c.ts"]).toBeUndefined();
  });
});

describe("handoff render — edge cases", () => {
  it("lists files touched and prior providers, and includes captured output", () => {
    const base = createTaskLedgerDocument({ task: "fix auth", repositoryPath: "/repo" });
    const ledger: TaskLedger = {
      ...base,
      sessions: [sessionRow(1, "claude"), sessionRow(2, "claude"), sessionRow(3, "gemini")],
      progress: {
        lastOutput: "patched login()",
        lastOutputTruncated: true,
        filesTouched: ["src/auth.ts", "src/math.ts"],
        filesTouchedTruncated: true,
        filesTouchedUnknown: false,
        transcriptAvailable: true,
      },
    };
    const text = renderHandoffSection(ledger);
    expect(text).toContain("Prior providers: claude → gemini");
    expect(text).toContain("- src/auth.ts");
    expect(text).toContain("(file list truncated)");
    expect(text).toContain("patched login()");
    expect(text).toContain("… [truncated]");
    expect(text).not.toContain("Prior model transcript is not available");
  });

  it("says none detected when the snapshot exists but nothing changed", () => {
    const ledger: TaskLedger = {
      ...createTaskLedgerDocument({ task: "t", repositoryPath: "/r" }),
      progress: {
        ...emptyProgress(),
        filesTouchedUnknown: false,
        filesTouched: [],
      },
    };
    expect(renderHandoffSection(ledger)).toContain("none detected");
  });

  it("drops secrets.json paths and private-key output before rendering", () => {
    const progress = sanitizeTaskProgress({
      lastOutput: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK\n-----END RSA PRIVATE KEY-----",
      lastOutputTruncated: false,
      filesTouched: ["src/ok.ts", "secrets.json", "id_rsa"],
      filesTouchedTruncated: false,
      filesTouchedUnknown: false,
      transcriptAvailable: true,
    });
    expect(progress.filesTouched).toEqual(["src/ok.ts"]);
    expect(progress.lastOutput).toBe("");
    expect(progress.transcriptAvailable).toBe(false);
  });

  it("truncates the handoff section to its own token budget", () => {
    const ledger: TaskLedger = {
      ...createTaskLedgerDocument({ task: "t", repositoryPath: "/r" }),
      progress: {
        ...emptyProgress(),
        lastOutput: "word ".repeat(500),
        transcriptAvailable: true,
        filesTouchedUnknown: false,
      },
    };
    const text = renderHandoffSection(ledger, { maxTokens: 20 });
    expect(text).toContain("handoff truncated to 20 tokens");
    expect(text.length).toBeLessThan(200);
  });

  it("prepends the context package so the new model does not re-scan", () => {
    const ledger = createTaskLedgerDocument({ task: "double", repositoryPath: "/repo" });
    const prompt = renderHandoffPrompt(packageStub("double"), ledger);
    expect(prompt).toContain("# Task");
    expect(prompt).toContain("double");
    expect(prompt).toContain("# Handoff");
    expect(prompt.indexOf("# Task")).toBeLessThan(prompt.indexOf("# Handoff"));
  });
});
