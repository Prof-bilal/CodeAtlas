import { spawn as nodeSpawn } from "node:child_process";
import { statSync } from "node:fs";
import { type Result, fail, ok } from "@atlas/shared";
import { InvalidWorkingDirectoryError, ProcessSpawnError } from "./errors";

/**
 * The minimal child-process surface the runner supervises. The real `spawn`
 * result satisfies this structurally; tests supply a controllable fake.
 */
export interface SpawnedProcess {
  readonly pid: number | undefined;
  readonly stdout: NodeJS.ReadableStream | null;
  readonly stderr: NodeJS.ReadableStream | null;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: "error", listener: (error: Error) => void): SpawnedProcess;
  on(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): SpawnedProcess;
}

/**
 * The injectable spawn boundary. The default implementation calls
 * `node:child_process` `spawn` with `shell: false` — an **argument array**, never
 * a shell string. Tests inject a fake to exercise the lifecycle offline.
 */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    shell: boolean;
    /**
     * How the child's stdio are wired: `"pipe"` (captured), `"ignore"`
     * (detached), or `"inherit"` (interactive terminal handoff — the child
     * shares the parent's stdin/stdout/stderr).
     */
    stdio?: "pipe" | "ignore" | "inherit";
  },
) => SpawnedProcess;

/** Default spawn: `spawn(command, argsArray, { shell: false })`. */
export const nodeSpawnFn: SpawnFn = (command, args, options) =>
  nodeSpawn(command, args, options) as unknown as SpawnedProcess;

/** What to launch and how to supervise it. */
export interface ProcessSpec {
  /** Resolved executable path (never a shell string). */
  readonly command: string;
  /** Argument array passed to the executable, verbatim. */
  readonly args: readonly string[];
  /** Working directory; defaults to the current process cwd. */
  readonly cwd?: string;
  /** Extra environment entries merged over `process.env`; never logged. */
  readonly env?: Readonly<Record<string, string>>;
  /** Kill the child after this many milliseconds. */
  readonly timeoutMs?: number;
  /** Cap on captured output per stream (prevents unbounded memory). */
  readonly maxOutputBytes?: number;
  /**
   * Stream wiring for ~long-running~ launches (`launch()`). Defaults to
   * `"ignore"` there so a chatty child can never block on a full pipe; the
   * one-shot `run()` keeps piping and capturing. `"inherit"` hands the child
   * the parent's stdio for an interactive terminal session.
   */
  readonly stdio?: "pipe" | "ignore" | "inherit";
}

/** The supervised outcome of a single external invocation. */
export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

/**
 * A supervised, **still-running** external process. `ProcessRunner.launch()`
 * hands back one of these so the session manager can track a long-lived child,
 * observe its exit, and stop/terminate it on demand. This is the low-level
 * process boundary the session manager builds on — it owns **execution**, not
 * session semantics.
 */
export interface RunningProcess {
  /** OS process id (may be `undefined` if the child never spawned). */
  readonly pid: number | undefined;
  /** True once the process has exited or failed to spawn. */
  readonly closed: boolean;
  /**
   * Register a one-time exit listener. Fires immediately (synchronously) when
   * the process already closed, so a late subscriber never misses the event.
   */
  onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  /** Graceful stop: SIGTERM, escalate to SIGKILL after the kill grace period. */
  stop(): Promise<void>;
  /** Force stop: immediate SIGKILL. */
  terminate(): Promise<void>;
  /**
   * The captured stdout/stderr when this process was launched with
   * `stdio: "pipe"` (bounded, safe to keep); `undefined` when the process did
   * not capture output (`stdio: "ignore"`). The buffer stays readable after the
   * process exits, so callers can report partial output honestly.
   */
  readOutput(): { stdout: string; stderr: string } | undefined;
}

/** Options for constructing a {@link ProcessRunner}. */
export interface ProcessRunnerOptions {
  /** Spawn implementation; inject a fake for offline tests. */
  readonly spawnFn?: SpawnFn;
  /** Grace period between SIGTERM and SIGKILL on timeout (default 2s). */
  readonly killGraceMs?: number;
  /** Timeout applied when `ProcessSpec.timeoutMs` is omitted (default 120s). */
  readonly defaultTimeoutMs?: number;
}

/**
 * Supervises one external process invocation: validates the working directory,
 * spawns with an argument array, captures output, enforces a timeout, and
 * reports exit codes and signals. This is the security-sensitive process
 * boundary of the orchestrator (see `docs/SECURITY.md`).
 */
export class ProcessRunner {
  private readonly spawnFn: SpawnFn;
  private readonly killGraceMs: number;
  private readonly defaultTimeoutMs: number;

  public constructor(options: ProcessRunnerOptions = {}) {
    this.spawnFn = options.spawnFn ?? nodeSpawnFn;
    this.killGraceMs = options.killGraceMs ?? KILL_GRACE_MS;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async run(spec: ProcessSpec): Promise<Result<ProcessResult>> {
    if (spec.cwd !== undefined && !isDirectory(spec.cwd)) {
      return fail(new InvalidWorkingDirectoryError(spec.cwd));
    }
    if (spec.timeoutMs !== undefined && spec.timeoutMs <= 0) {
      return fail(new Error(`timeoutMs must be a positive number, got ${spec.timeoutMs}`));
    }

    const startedAt = Date.now();
    const maxOutputBytes = spec.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const env: NodeJS.ProcessEnv = { ...process.env, ...spec.env };

    let handle: SpawnedProcess;
    try {
      handle = this.spawnFn(spec.command, [...spec.args], {
        ...(spec.cwd !== undefined ? { cwd: spec.cwd } : {}),
        env,
        shell: false,
      });
    } catch (error) {
      return fail(new ProcessSpawnError(spec.command, error));
    }

    const stdout = new OutputBuffer(maxOutputBytes);
    const stderr = new OutputBuffer(maxOutputBytes);
    if (handle.stdout !== null) {
      handle.stdout.on("data", (chunk: string | Buffer) => stdout.push(chunk));
    }
    if (handle.stderr !== null) {
      handle.stderr.on("data", (chunk: string | Buffer) => stderr.push(chunk));
    }

    return await new Promise<Result<ProcessResult>>((resolve) => {
      let settled = false;
      let timedOut = false;
      let escalationTimer: ReturnType<typeof setTimeout> | undefined;

      const timer = setTimeout(() => {
        timedOut = true;
        handle.kill("SIGTERM");
        // Escalate to SIGKILL shortly after SIGTERM if the child is stubborn.
        escalationTimer = setTimeout(() => {
          if (!settled) {
            handle.kill("SIGKILL");
          }
        }, this.killGraceMs);
      }, spec.timeoutMs ?? this.defaultTimeoutMs);

      const settle = (result: Result<ProcessResult>): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (escalationTimer !== undefined) {
          clearTimeout(escalationTimer);
        }
        resolve(result);
      };

      handle.on("error", (error) => {
        settle(fail(new ProcessSpawnError(spec.command, error)));
      });

      handle.on("close", (code, signal) => {
        settle(
          ok({
            exitCode: code,
            signal: signal as string | null,
            timedOut,
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            durationMs: Date.now() - startedAt,
          }),
        );
      });
    });
  }

  /**
   * Launch a long-running external process and return a {@link RunningProcess}
   * handle, without waiting for it to finish. The caller observes the exit and
   * decides when (and how) to stop the child. The working directory and timeout
   * are validated exactly like `run()`; spawn failures surface as a
   * {@link ProcessSpawnError} failure.
   */
  public async launch(spec: ProcessSpec): Promise<Result<RunningProcess>> {
    if (spec.cwd !== undefined && !isDirectory(spec.cwd)) {
      return fail(new InvalidWorkingDirectoryError(spec.cwd));
    }
    if (spec.timeoutMs !== undefined && spec.timeoutMs <= 0) {
      return fail(new Error(`timeoutMs must be a positive number, got ${spec.timeoutMs}`));
    }

    const env: NodeJS.ProcessEnv = { ...process.env, ...spec.env };
    let handle: SpawnedProcess;

    try {
      handle = this.spawnFn(spec.command, [...spec.args], {
        ...(spec.cwd !== undefined ? { cwd: spec.cwd } : {}),
        env,
        shell: false,
        // Sessions do not capture output; ignore stdio so a chatty child can
        // never block on a full pipe (see SECURITY.md: no shell, arg arrays).
        stdio: spec.stdio ?? "ignore",
      });
    } catch (error) {
      return fail(new ProcessSpawnError(spec.command, error));
    }

    return ok(
      new RunningProcessImpl(handle, this.killGraceMs, (spec.stdio ?? "ignore") === "pipe"),
    );
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576; // 1 MiB per stream
const KILL_GRACE_MS = 2_000;

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Bounded output collector so a runaway child cannot exhaust memory. */
class OutputBuffer {
  private readonly chunks: Buffer[] = [];
  private bytes = 0;
  private truncated = false;

  public constructor(private readonly maxBytes: number) {}

  public push(chunk: string | Buffer): void {
    if (this.truncated) {
      return;
    }
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    const remaining = this.maxBytes - this.bytes;
    if (remaining <= 0) {
      this.truncated = true;
      return;
    }
    const slice = buffer.subarray(0, remaining);
    this.chunks.push(slice);
    this.bytes += slice.length;
    if (slice.length < buffer.length) {
      this.truncated = true;
    }
  }

  public toString(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

/**
 * Internal {@link RunningProcess} backed by a spawned child. Buffers the exit
 * so late-registered listeners still fire, and escalates SIGTERM → SIGKILL on
 * `stop()` when the child is stubborn. All operations are idempotent: they are
 * no-ops once the process has closed, so concurrent stop/terminate never
 * double-terminate or double-clean.
 */
class RunningProcessImpl implements RunningProcess {
  private readonly handle: SpawnedProcess;
  private readonly killGraceMs: number;
  private readonly stdout: OutputBuffer | undefined;
  private readonly stderr: OutputBuffer | undefined;
  private exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  private readonly listeners = new Set<
    (code: number | null, signal: NodeJS.Signals | null) => void
  >();

  public constructor(handle: SpawnedProcess, killGraceMs: number, capture: boolean) {
    this.handle = handle;
    this.killGraceMs = killGraceMs;
    if (capture) {
      // Attach data listeners immediately so a chatty child can never block on a
      // full pipe; the buffers are bounded (OutputBuffer drops the tail).
      this.stdout = new OutputBuffer(DEFAULT_MAX_OUTPUT_BYTES);
      this.stderr = new OutputBuffer(DEFAULT_MAX_OUTPUT_BYTES);
      if (handle.stdout !== null) {
        handle.stdout.on("data", (chunk: string | Buffer) => this.stdout?.push(chunk));
      }
      if (handle.stderr !== null) {
        handle.stderr.on("data", (chunk: string | Buffer) => this.stderr?.push(chunk));
      }
    }
    // A spawn-time failure (ENOENT, EACCES, …) means the process will never
    // run; surface it as a closed process so the manager can mark the session
    // FAILED instead of leaving it stuck in RUNNING.
    handle.on("error", () => {
      this.notifyClosed(null, null);
    });
    handle.on("close", (code, signal) => {
      this.notifyClosed(code as number | null, signal as NodeJS.Signals | null);
    });
  }

  public get pid(): number | undefined {
    return this.handle.pid;
  }

  public get closed(): boolean {
    return this.exitInfo !== null;
  }

  public readOutput(): { stdout: string; stderr: string } | undefined {
    if (this.stdout === undefined || this.stderr === undefined) {
      return undefined;
    }
    return { stdout: this.stdout.toString(), stderr: this.stderr.toString() };
  }

  public onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void): void {
    if (this.exitInfo !== null) {
      listener(this.exitInfo.code, this.exitInfo.signal);
      return;
    }
    this.listeners.add(listener);
  }

  public async stop(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.handle.kill("SIGTERM");
    await this.waitForClose(this.killGraceMs);
    if (!this.closed) {
      this.handle.kill("SIGKILL");
      await this.waitForClose(this.killGraceMs);
    }
  }

  public async terminate(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.handle.kill("SIGKILL");
    await this.waitForClose(this.killGraceMs);
  }

  /** Wait for close, optionally bounded so an unresponsive child cannot hang a caller. */
  private async waitForClose(timeoutMs?: number): Promise<void> {
    if (this.closed) {
      return;
    }
    if (timeoutMs === undefined) {
      await new Promise<void>((resolve) => {
        this.listeners.add(() => resolve());
      });
      return;
    }
    await new Promise<void>((resolve) => {
      const listener = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        resolve();
      }, timeoutMs);
      this.listeners.add(listener);
    });
  }

  private notifyClosed(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.exitInfo !== null) {
      return;
    }
    this.exitInfo = { code, signal };
    for (const listener of [...this.listeners]) {
      listener(code, signal);
    }
    this.listeners.clear();
  }
}
