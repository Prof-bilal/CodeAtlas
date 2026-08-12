import { spawn as nodeSpawn } from "node:child_process";
import { statSync } from "node:fs";
import { type Result, fail, ok } from "@atlas/shared";
import { InstallInvalidRequestError, InstallProcessError } from "./installer-errors";

/**
 * The minimal child-process surface the installer supervises. The real `spawn`
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
 * a shell string (see `docs/SECURITY.md`). Tests inject a fake to exercise the
 * lifecycle offline.
 */
export type InstallerSpawnFn = (
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    shell: boolean;
  },
) => SpawnedProcess;

/** Default spawn: `spawn(command, argsArray, { shell: false })`. */
export const nodeSpawnFn: InstallerSpawnFn = (command, args, options) =>
  nodeSpawn(command, args, options) as unknown as SpawnedProcess;

/** One supervised external invocation by the installer. */
export interface InstallerProcessSpec {
  /** Resolved executable path (never a shell string). */
  readonly command: string;
  /** Argument array passed to the executable, verbatim. */
  readonly args: readonly string[];
  /** Working directory; validated to exist before spawning. */
  readonly cwd?: string;
  /** Kill the child after this many milliseconds. */
  readonly timeoutMs?: number;
  /** Cap on captured output per stream (prevents unbounded memory). */
  readonly maxOutputBytes?: number;
}

/** The bounded outcome of one installer-spawned child. */
export interface InstallerProcessResult {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

/** Options for constructing an {@link InstallerProcess}. */
export interface InstallerProcessOptions {
  /** Spawn implementation; inject a fake for offline tests. */
  readonly spawnFn?: InstallerSpawnFn;
  /** Timeout applied when `InstallerProcessSpec.timeoutMs` is omitted. */
  readonly defaultTimeoutMs?: number;
}

/**
 * Supervises one external process invocation for the Tool Installer: validates
 * the working directory, spawns with an **argument array** (`shell: false`),
 * captures bounded output, enforces a timeout, and reports exit codes and
 * signals. This is the security-sensitive process boundary of the Installer
 * (Task 22) — see `docs/SECURITY.md` §3.
 *
 * `@atlas/toolkit` is dependency-restricted to `core` + `shared`, so this is a
 * deliberately small local copy of the pattern in `@atlas/agents`
 * `ProcessRunner.run`; it is **not** a fork of that service.
 */
export class InstallerProcess {
  private readonly spawnFn: InstallerSpawnFn;
  private readonly defaultTimeoutMs: number;

  public constructor(options: InstallerProcessOptions = {}) {
    this.spawnFn = options.spawnFn ?? nodeSpawnFn;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_INSTALL_TIMEOUT_MS;
  }

  public async run(spec: InstallerProcessSpec): Promise<Result<InstallerProcessResult>> {
    if (spec.cwd !== undefined && !isDirectory(spec.cwd)) {
      return fail(new InstallInvalidRequestError(`working directory "${spec.cwd}" does not exist`));
    }
    if (spec.timeoutMs !== undefined && spec.timeoutMs <= 0) {
      return fail(
        new InstallInvalidRequestError(
          `timeoutMs must be a positive number, got ${spec.timeoutMs}`,
        ),
      );
    }

    const startedAt = Date.now();
    const maxOutputBytes = spec.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

    let handle: SpawnedProcess;
    try {
      handle = this.spawnFn(spec.command, [...spec.args], {
        ...(spec.cwd !== undefined ? { cwd: spec.cwd } : {}),
        env: process.env,
        shell: false,
      });
    } catch (error) {
      return fail(new InstallProcessError(spec.command, error));
    }

    const stdout = new OutputBuffer(maxOutputBytes);
    const stderr = new OutputBuffer(maxOutputBytes);
    if (handle.stdout !== null) {
      handle.stdout.on("data", (chunk: string | Buffer) => stdout.push(chunk));
    }
    if (handle.stderr !== null) {
      handle.stderr.on("data", (chunk: string | Buffer) => stderr.push(chunk));
    }

    return await new Promise<Result<InstallerProcessResult>>((resolve) => {
      let settled = false;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        handle.kill("SIGTERM");
      }, spec.timeoutMs ?? this.defaultTimeoutMs);

      const settle = (result: Result<InstallerProcessResult>): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      handle.on("error", (error) => {
        settle(fail(new InstallProcessError(spec.command, error)));
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
}

const DEFAULT_INSTALL_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576; // 1 MiB per stream

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Bounded output collector so a runaway installer cannot exhaust memory. */
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
