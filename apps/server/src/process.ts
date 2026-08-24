import { type ChildProcess, spawn } from "node:child_process";

/**
 * Result of a supervised child process run (mirrors the honest partial-output
 * contract of `@atlas/agents`' ProcessRunner, scoped to what the server needs).
 */
export interface ProcessRunResult {
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly error?: string | undefined;
}

export interface ProcessRunOptions {
  /** Kill the child after this budget (default 60s). */
  readonly timeoutMs?: number;
  /** Working directory for the child. */
  readonly cwd?: string;
  /** Cap for stdout/stderr capture (default 1 MiB each; excess is dropped). */
  readonly maxOutputChars?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_CHARS = 1_048_576;

/**
 * Spawn `file` with an **argument array** — never a shell string (see
 * docs/SECURITY.md). Kills the child on timeout (SIGTERM → SIGKILL) and
 * reports partial output honestly.
 */
export function runProcess(
  file: string,
  args: readonly string[],
  options: ProcessRunOptions = {},
): Promise<ProcessRunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxChars = options.maxOutputChars ?? MAX_OUTPUT_CHARS;

  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(file, [...args], {
        shell: false,
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      resolve({
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const capture = (chunk: Buffer, current: string): string => {
      const text = chunk.toString("utf8");
      const next = current + text;
      return next.length > maxChars ? next.slice(0, maxChars) : next;
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = capture(chunk, stdout);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = capture(chunk, stderr);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);

    const finish = (exitCode: number | null, error?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: !timedOut && exitCode === 0 && error === undefined,
        exitCode,
        stdout,
        stderr,
        timedOut,
        error,
      });
    };

    child.on("error", (err) => finish(null, err.message));
    child.on("close", (code) => finish(code));
  });
}
