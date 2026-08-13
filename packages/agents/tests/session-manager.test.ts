import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentCliNotFoundError, UnknownAgentError } from "../src/errors";
import { ProcessRunner } from "../src/process";
import {
  InvalidRepositoryPathError,
  SessionStateError,
  UnknownSessionError,
} from "../src/session-errors";
import { SessionManager } from "../src/session-manager";
import { createFakeSpawn, flushStreams } from "./helpers";

/** Stub resolver that reports a fixed "installed" path for every binary. */
function installedResolver(): (binary: string) => string | null {
  const base = "C:\\tools";
  return (binary) => (binary.length > 0 ? `${base}/${binary}` : null);
}

interface ManagerOptions {
  readonly killGraceMs?: number;
  readonly maxRetainedSessions?: number;
  readonly resolveExecutable?: (binary: string) => string | null;
}

function makeManager(options: ManagerOptions = {}): {
  manager: SessionManager;
  fake: ReturnType<typeof createFakeSpawn>;
} {
  const fake = createFakeSpawn();
  const runner = new ProcessRunner({
    spawnFn: fake.spawn,
    ...(options.killGraceMs !== undefined ? { killGraceMs: options.killGraceMs } : {}),
  });
  const manager = new SessionManager({
    resolveExecutable: options.resolveExecutable ?? installedResolver(),
    processRunner: runner,
    ...(options.maxRetainedSessions !== undefined
      ? { maxRetainedSessions: options.maxRetainedSessions }
      : {}),
  });
  return { manager, fake };
}

const tempDirs: string[] = [];
function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-session-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("SessionManager", () => {
  describe("createSession", () => {
    it("creates a session in CREATED state with a unique short id", () => {
      const { manager } = makeManager();
      const repo = makeRepo();
      const result = manager.createSession({ provider: "claude", repositoryPath: repo });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      const session = result.value;
      expect(session.id).toMatch(/^[0-9a-f]{8}$/);
      expect(session.status).toBe("CREATED");
      expect(session.provider).toBe("claude");
      expect(session.agentId).toBe("claude");
      expect(session.repositoryPath).toBe(resolve(repo));
      expect(session.processId).toBeUndefined();
      expect(session.startedAt).toBeUndefined();
      expect(session.endedAt).toBeUndefined();
      expect(session.exitCode).toBeUndefined();
      expect(session.error).toBeUndefined();
    });

    it("generates distinct ids for distinct sessions", () => {
      const { manager } = makeManager();
      const repo = makeRepo();
      const a = manager.createSession({ provider: "claude", repositoryPath: repo });
      const b = manager.createSession({ provider: "gemini", repositoryPath: repo });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) {
        return;
      }
      expect(a.value.id).not.toBe(b.value.id);
    });

    it("rejects an unknown provider", () => {
      const { manager } = makeManager();
      const result = manager.createSession({ provider: "nope", repositoryPath: makeRepo() });

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(UnknownAgentError);
    });

    it("rejects a repository path that is not a directory", () => {
      const { manager } = makeManager();
      const result = manager.createSession({
        provider: "claude",
        repositoryPath: "no-such-dir-xyz",
      });

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(InvalidRepositoryPathError);
    });
  });

  describe("startSession", () => {
    it("launches the CLI and transitions CREATED → STARTING → RUNNING", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );

      const result = await manager.startSession(session.id);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.status).toBe("RUNNING");
      expect(result.value.processId).toBe(9001);
      expect(result.value.startedAt).toBeTypeOf("number");
      expect(fake.records[0]?.command).toContain("claude");
      expect(fake.records[0]?.args).toEqual(["-p", ""]);
      expect(fake.records[0]?.options.cwd).toBe(session.repositoryPath);
      expect(fake.records[0]?.options.shell).toBe(false);
      expect(fake.records[0]?.options.stdio).toBe("ignore");
    });

    it("forwards an optional prompt and extra args to the CLI", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "gemini", repositoryPath: makeRepo() }),
      );

      const result = await manager.startSession(session.id, {
        prompt: "explain AuthService",
        args: ["--model", "x"],
      });

      expect(result.ok).toBe(true);
      expect(fake.records[0]?.args).toEqual(["-p", "explain AuthService", "--model", "x"]);
    });

    it("launches interactively: inherited stdio and no run-mode flags or prompt", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );

      const result = await manager.startSession(session.id, {
        prompt: "ignored in interactive mode",
        args: ["--model", "sonnet"],
        interactive: true,
      });

      expect(result.ok).toBe(true);
      expect(fake.records[0]?.args).toEqual(["--model", "sonnet"]);
      expect(fake.records[0]?.options.stdio).toBe("inherit");
      expect(manager.getSessionOutput(session.id)).toBeUndefined();
    });

    it("interactive launch wins over captureOutput and drops output capture", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "codex", repositoryPath: makeRepo() }),
      );

      const result = await manager.startSession(session.id, {
        prompt: "one-shot text",
        interactive: true,
        captureOutput: true,
      });

      expect(result.ok).toBe(true);
      expect(fake.records[0]?.args).toEqual([]);
      expect(fake.records[0]?.options.stdio).toBe("inherit");
    });

    it("interactive launch stops and reports exit like any session", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "opencode", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id, { interactive: true });

      const pending = manager.stopSession(session.id);
      fake.processes[0]?.close(0);
      const result = await pending;

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.status).toBe("STOPPED");
      expect(result.value.exitCode).toBe(0);
    });

    it("fails with AgentCliNotFoundError and marks the session FAILED when the CLI is missing", async () => {
      const { manager, fake } = makeManager({ resolveExecutable: () => null });
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );

      const result = await manager.startSession(session.id);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(AgentCliNotFoundError);
      expect(fake.records).toHaveLength(0);
      const after = manager.getSession(session.id);
      expect(after?.status).toBe("FAILED");
      expect(after?.endedAt).toBeTypeOf("number");
      expect(after?.error).toContain("could not be found");
    });

    it("fails with UnknownSessionError for a missing session id", async () => {
      const { manager } = makeManager();
      const result = await manager.startSession("nope");

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(UnknownSessionError);
    });

    it("rejects a duplicate (already RUNNING) start", async () => {
      const { manager } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);

      const result = await manager.startSession(session.id);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(SessionStateError);
    });

    it("tracks a spawn failure as FAILED (process never ran)", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );

      await manager.startSession(session.id);
      fake.processes[0]?.error(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const after = manager.getSession(session.id);
      expect(after?.status).toBe("FAILED");
      expect(after?.error).toContain("failed to start or exited unexpectedly");
    });
  });

  describe("running sessions", () => {
    it("runs claude, gemini, and codex as three independent sessions", async () => {
      const { manager } = makeManager();
      const repoA = makeRepo();
      const repoB = makeRepo();
      const claude = expectOk(manager.createSession({ provider: "claude", repositoryPath: repoA }));
      const gemini = expectOk(manager.createSession({ provider: "gemini", repositoryPath: repoA }));
      const codex = expectOk(manager.createSession({ provider: "codex", repositoryPath: repoB }));

      for (const session of [claude, gemini, codex]) {
        const started = await manager.startSession(session.id);
        expect(started.ok).toBe(true);
        if (started.ok) {
          expect(started.value.status).toBe("RUNNING");
        }
      }

      expect(manager.listSessions()).toHaveLength(3);
      expect(manager.getActiveSessions()).toHaveLength(3);
      const pids = new Set(manager.listSessions().map((s) => s.processId));
      expect(pids.size).toBe(3);
      expect(manager.getSession(claude.id)?.repositoryPath).toBe(resolve(repoA));
      expect(manager.getSession(gemini.id)?.repositoryPath).toBe(resolve(repoA));
      expect(manager.getSession(codex.id)?.repositoryPath).toBe(resolve(repoB));
    });
  });

  describe("stopSession", () => {
    it("gracefully stops a running session (RUNNING → STOPPING → STOPPED)", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);
      const proc = fake.processes[0];

      const pending = manager.stopSession(session.id);
      expect(proc?.killCalls).toContain("SIGTERM");
      proc?.close(0);
      const result = await pending;

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.status).toBe("STOPPED");
      expect(result.value.exitCode).toBe(0);
      expect(result.value.endedAt).toBeTypeOf("number");
    });

    it("finalizes an unresponsive process to STOPPED with a note (no stuck STOPPING)", async () => {
      const { manager, fake } = makeManager({ killGraceMs: 5 });
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);
      const proc = fake.processes[0];

      const result = await manager.stopSession(session.id);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.status).toBe("STOPPED");
      expect(result.value.error).toBe("process did not exit after a stop was requested");
      expect(proc?.killCalls).toContain("SIGTERM");
      expect(proc?.killCalls).toContain("SIGKILL");
    });

    it("is idempotent when already stopping", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);
      const proc = fake.processes[0];

      const first = manager.stopSession(session.id);
      const second = await manager.stopSession(session.id);
      expect(second.ok).toBe(true);
      proc?.close(0);
      await first;
    });

    it("fails for an already-stopped session", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);
      const pending = manager.stopSession(session.id);
      fake.processes[0]?.close(0);
      await pending;

      const result = await manager.stopSession(session.id);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(SessionStateError);
      expect(result.error.message).toContain("already STOPPED");
    });

    it("fails for a missing session id", async () => {
      const { manager } = makeManager();
      const result = await manager.stopSession("nope");

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(UnknownSessionError);
    });
  });

  describe("terminateSession", () => {
    it("force-terminates a running session with SIGKILL", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);
      const proc = fake.processes[0];

      const pending = manager.terminateSession(session.id);
      expect(proc?.killCalls).toContain("SIGKILL");
      proc?.close(null, "SIGKILL");
      const result = await pending;

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.status).toBe("STOPPED");
    });

    it("fails for a stopped session", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);
      fake.processes[0]?.close(0);

      const result = await manager.terminateSession(session.id);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(SessionStateError);
    });
  });

  describe("process exit handling", () => {
    it("marks a clean exit (code 0) as STOPPED", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);

      fake.processes[0]?.close(0);

      const after = manager.getSession(session.id);
      expect(after?.status).toBe("STOPPED");
      expect(after?.exitCode).toBe(0);
      expect(after?.error).toBeUndefined();
    });

    it("marks a non-zero exit as FAILED with a safe message", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);

      fake.processes[0]?.close(3);

      const after = manager.getSession(session.id);
      expect(after?.status).toBe("FAILED");
      expect(after?.exitCode).toBe(3);
      expect(after?.error).toContain("code 3");
    });

    it("marks a child killed by a signal as FAILED", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);

      fake.processes[0]?.close(null, "SIGSEGV");

      const after = manager.getSession(session.id);
      expect(after?.status).toBe("FAILED");
      expect(after?.exitCode).toBeNull();
      expect(after?.error).toContain("SIGSEGV");
    });
  });

  describe("isolation", () => {
    it("a Claude failure does not affect a running Gemini session", async () => {
      const { manager, fake } = makeManager();
      const repo = makeRepo();
      const claude = expectOk(manager.createSession({ provider: "claude", repositoryPath: repo }));
      const gemini = expectOk(manager.createSession({ provider: "gemini", repositoryPath: repo }));
      await manager.startSession(claude.id);
      await manager.startSession(gemini.id);

      // Claude crashes with a non-zero exit.
      fake.processes[0]?.close(1);

      expect(manager.getSession(claude.id)?.status).toBe("FAILED");
      expect(manager.getSession(gemini.id)?.status).toBe("RUNNING");
    });
  });

  describe("multiple agents (mandatory orchestration scenario)", () => {
    it("keeps Claude and Codex RUNNING while Gemini is stopped", async () => {
      const { manager, fake } = makeManager();
      const repo = makeRepo();
      const claude = expectOk(manager.createSession({ provider: "claude", repositoryPath: repo }));
      const gemini = expectOk(manager.createSession({ provider: "gemini", repositoryPath: repo }));
      const codex = expectOk(manager.createSession({ provider: "codex", repositoryPath: repo }));

      for (const session of [claude, gemini, codex]) {
        const started = await manager.startSession(session.id);
        expect(started.ok).toBe(true);
        if (started.ok) {
          expect(started.value.status).toBe("RUNNING");
        }
      }

      // Stop Gemini only.
      const geminiProc = fake.processes[1];
      const pending = manager.stopSession(gemini.id);
      geminiProc?.close(0);
      const result = await pending;
      expect(result.ok).toBe(true);

      expect(manager.getSession(gemini.id)?.status).toBe("STOPPED");
      expect(manager.getSession(claude.id)?.status).toBe("RUNNING");
      expect(manager.getSession(codex.id)?.status).toBe("RUNNING");
    });
  });

  describe("shutdown", () => {
    it("stops every active session when CodeAtlas shuts down", async () => {
      const { manager } = makeManager({ killGraceMs: 5 });
      const repo = makeRepo();
      const claude = expectOk(manager.createSession({ provider: "claude", repositoryPath: repo }));
      const codex = expectOk(manager.createSession({ provider: "codex", repositoryPath: repo }));
      await manager.startSession(claude.id);
      await manager.startSession(codex.id);

      await manager.shutdown();

      expect(manager.getSession(claude.id)?.status).toBe("STOPPED");
      expect(manager.getSession(codex.id)?.status).toBe("STOPPED");
      expect(manager.getActiveSessions()).toHaveLength(0);
    });

    it("is a no-op when called twice", async () => {
      const { manager } = makeManager({ killGraceMs: 5 });
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id);

      await manager.shutdown();
      await manager.shutdown();
      expect(manager.getSession(session.id)?.status).toBe("STOPPED");
    });
  });

  describe("output capture", () => {
    it("pipes stdio and exposes captured output only when captureOutput is set", async () => {
      const { manager, fake } = makeManager();
      const repo = makeRepo();
      const plain = expectOk(manager.createSession({ provider: "claude", repositoryPath: repo }));
      const captured = expectOk(
        manager.createSession({ provider: "gemini", repositoryPath: repo }),
      );

      await manager.startSession(plain.id);
      await manager.startSession(captured.id, { prompt: "review", captureOutput: true });

      expect(fake.records[0]?.options.stdio).toBe("ignore");
      expect(fake.records[1]?.options.stdio).toBe("pipe");
      expect(manager.getSessionOutput(plain.id)).toBeUndefined();

      const proc = fake.processes[1];
      proc?.writeStdout("The security review found no issues.\n");
      await flushStreams();
      expect(manager.getSessionOutput(captured.id)?.stdout).toContain("The security review");
    });

    it("keeps the captured output readable after the session reaches a terminal state", async () => {
      const { manager, fake } = makeManager();
      const session = expectOk(
        manager.createSession({ provider: "claude", repositoryPath: makeRepo() }),
      );
      await manager.startSession(session.id, { captureOutput: true });

      fake.processes[0]?.writeStdout("partial result before exit");
      await flushStreams();
      fake.processes[0]?.close(1);

      expect(manager.getSession(session.id)?.status).toBe("FAILED");
      expect(manager.getSessionOutput(session.id)?.stdout).toContain("partial result before exit");
    });

    it("returns undefined for an unknown session id", () => {
      const { manager } = makeManager();
      expect(manager.getSessionOutput("nope")).toBeUndefined();
    });
  });

  describe("memory management", () => {
    it("prunes the oldest terminal sessions beyond the retention cap", async () => {
      const { manager } = makeManager({
        maxRetainedSessions: 2,
        resolveExecutable: () => null,
      });
      const ids = [
        expectOk(manager.createSession({ provider: "claude", repositoryPath: makeRepo() })).id,
        expectOk(manager.createSession({ provider: "gemini", repositoryPath: makeRepo() })).id,
        expectOk(manager.createSession({ provider: "codex", repositoryPath: makeRepo() })).id,
      ];
      for (const id of ids) {
        await manager.startSession(id); // CLI unavailable → FAILED → prune
      }

      expect(manager.listSessions()).toHaveLength(2);
      expect(manager.getSession(ids[0])).toBeUndefined();
      expect(manager.getSession(ids[2])).toBeDefined();
    });
  });
});

/** Assert a `Result` is `ok` and return the value (test helper). */
function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got: ${String(result.error)}`);
  }
  return result.value;
}
