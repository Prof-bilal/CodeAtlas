import { join } from "node:path";
import { Readable } from "node:stream";
import type { Result } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { InstallInvalidRequestError, InstallProcessError } from "../src/installer-errors";
import { InstallerProcess, type InstallerSpawnFn } from "../src/installer-process";
import { createTempDir } from "./helpers";

/**
 * Tests for the Installer's process boundary (Task 22). This is the
 * security-sensitive seam: it must always spawn with an **argument array** and
 * `shell: false`, validate the working directory, cap captured output, enforce
 * a timeout, and report exit codes / signals honestly. No real child is ever
 * spawned — every call is a controllable fake that satisfies the
 * `SpawnedProcess` shape.
 */

interface Recorded {
  command: string;
  args: readonly string[];
  cwd?: string | undefined;
  shell?: boolean | undefined;
}

/** Assert a failure `Result` and return its error (narrows the union for TS). */
function failureOf<T>(result: Result<T>): Error {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected a failure Result");
  }
  return result.error;
}

function fakeSpawn(
  records: Recorded[],
  opts: {
    exitCode?: number | null;
    signal?: string | null;
    error?: Error;
    neverClose?: boolean;
    stdout?: string;
    stderr?: string;
  } = {},
): InstallerSpawnFn {
  return (command, args, options) => {
    records.push({ command, args, cwd: options.cwd, shell: options.shell });
    // A manually driven stream: the chunk is pushed synchronously and then the
    // stream is ended, so run()'s 'data' handlers receive it before close.
    const stream = (content: string) => {
      const s = new Readable({ read() {} });
      if (content.length > 0) {
        s.push(content);
      }
      s.push(null);
      return s;
    };
    const stdout = stream(opts.stdout ?? "");
    const stderr = stream(opts.stderr ?? "");
    let close: ((code: number | null, signal: string | null) => void) | undefined;
    let error: ((e: Error) => void) | undefined;
    const proc = {
      pid: 7,
      stdout,
      stderr,
      kill: () => {
        // Killing implies the child finally closed (with a signal), which is
        // what lets InstallerProcess settle the timeout path.
        close?.(null, "SIGTERM");
        return true;
      },
      on: (event: string, listener: unknown) => {
        if (event === "close") {
          close = listener as (code: number | null, signal: string | null) => void;
        }
        if (event === "error") {
          error = listener as (e: Error) => void;
        }
        return proc;
      },
    };
    if (!opts.neverClose) {
      // Macrotask: runs after the stream data has been delivered to 'data'.
      setTimeout(() => {
        if (opts.error !== undefined) {
          error?.(opts.error);
        } else {
          close?.(opts.exitCode ?? 0, opts.signal ?? null);
        }
      }, 1);
    }
    return proc;
  };
}

describe("InstallerProcess.run", () => {
  it("spawns with an argument array and shell:false, and reports the exit code", async () => {
    const records: Recorded[] = [];
    const process = new InstallerProcess({ spawnFn: fakeSpawn(records, { exitCode: 0 }) });
    const cwd = createTempDir().root;
    const result = await process.run({ command: "npm", args: ["install", "x"], cwd });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.exitCode).toBe(0);
    expect(records).toEqual([{ command: "npm", args: ["install", "x"], cwd, shell: false }]);
  });

  it("propagates a non-zero exit code for a failed install", async () => {
    const process = new InstallerProcess({ spawnFn: fakeSpawn([], { exitCode: 1 }) });
    const result = await process.run({ command: "npm", args: ["install", "x"] });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.exitCode).toBe(1);
  });

  it("rejects a working directory that does not exist (path safety)", async () => {
    const process = new InstallerProcess({ spawnFn: fakeSpawn([]) });
    const result = await process.run({
      command: "npm",
      args: ["install", "x"],
      cwd: join(createTempDir().root, "nope"),
    });
    expect(result.ok).toBe(false);
    expect(failureOf(result)).toBeInstanceOf(InstallInvalidRequestError);
  });

  it("times out and kills the child when it never exits", async () => {
    const process = new InstallerProcess({
      spawnFn: fakeSpawn([], { neverClose: true, exitCode: null }),
      defaultTimeoutMs: 40,
    });
    const result = await process.run({ command: "slow", args: ["install"] });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.timedOut).toBe(true);
    expect(result.value.exitCode).toBeNull();
  });

  it("fails with a typed process error when spawn emits an error event", async () => {
    const process = new InstallerProcess({
      spawnFn: fakeSpawn([], { error: new Error("ENOENT") }),
    });
    const result = await process.run({ command: "missing-bin", args: [] });
    expect(failureOf(result)).toBeInstanceOf(InstallProcessError);
  });

  it("captures stdout/stderr but bounds the output", async () => {
    const big = "x".repeat(2048);
    const records: Recorded[] = [];
    const process = new InstallerProcess({
      spawnFn: fakeSpawn(records, { exitCode: 0, stdout: big, stderr: "warn" }),
    });
    const result = await process.run({
      command: "npm",
      args: ["install", "x"],
      maxOutputBytes: 128,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.stdout.length).toBeLessThanOrEqual(128);
    expect(result.value.stdout.length).toBe(128); // truncated to the cap
    expect(result.value.stderr).toBe("warn");
  });
});
