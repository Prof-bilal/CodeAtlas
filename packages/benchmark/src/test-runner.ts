import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Explicit hidden-test runner for benchmark task completion (Phase 0).
 *
 * SECURITY (ADR-015 policy preview):
 * - Commands are ALWAYS argv arrays — never shell strings (`shell: false`).
 * - Test execution is OPT-IN: callers must pass `allowExecution: true`.
 * - The default command runs the repository's own test script (vitest) with
 *   the specific hidden-test files as arguments; nothing is downloaded and
 *   no repository-derived string is passed to a shell.
 * - A hard timeout kills the child; partial output is returned for diagnosis.
 */

/** Options for {@link runHiddenTests}. */
export interface RunHiddenTestsOptions {
  /** Absolute path of the repository under test. */
  readonly repoPath: string;
  /** Repository-relative test files to run (the task's `hidden_tests`). */
  readonly testFiles: readonly string[];
  /** Kill the child after this many milliseconds (default 120_000). */
  readonly timeoutMs?: number;
  /**
   * Command override as an argv array (file + args). Defaults to
   * `["npx", "vitest", "run", ...testFiles]` executed in `repoPath`.
   * Must be allow-listed by the caller — see ADR-015 when it lands.
   */
  readonly command?: readonly string[];
  /** Refuse to run unless explicitly enabled. Default `false` (safe). */
  readonly allowExecution?: boolean;
}

/** The outcome of a hidden-test run. */
export interface HiddenTestResult {
  /** Whether the runner executed at all (false = refused/invalid). */
  readonly executed: boolean;
  /** Process exit code (0 = all tests passed); null when killed/not run. */
  readonly exitCode: number | null;
  /** Whether the run hit the timeout. */
  readonly timedOut: boolean;
  /** Whether every requested test file exists in the repo. */
  readonly filesPresent: boolean;
  /** Missing test files (empty when all present). */
  readonly missingFiles: readonly string[];
  /** Combined stdout+stderr (truncated). */
  readonly output: string;
  /** Wall-clock duration in milliseconds. */
  readonly durationMs: number;
  /** Human-readable refusal reason when `executed` is false. */
  readonly reason?: string;
}

/** Upper bound for captured output (keep reports small). */
const MAX_OUTPUT_CHARS = 50_000;

/**
 * Run the given hidden-test files in the repository. Never throws.
 */
export async function runHiddenTests(options: RunHiddenTestsOptions): Promise<HiddenTestResult> {
  const started = Date.now();
  const missingFiles = options.testFiles.filter((f) => !existsSync(join(options.repoPath, f)));
  if (missingFiles.length > 0) {
    return {
      ...refused(`Missing test files: ${missingFiles.join(", ")}`, started),
      filesPresent: false,
      missingFiles,
    };
  }
  if (options.allowExecution !== true) {
    return refused("Test execution was not explicitly allowed (allowExecution).", started);
  }
  if (options.testFiles.length === 0) {
    return refused("No test files specified.", started);
  }

  const command = options.command ?? ["npx", "vitest", "run", ...options.testFiles];
  if (command.length === 0 || typeof command[0] !== "string" || command[0] === "") {
    return refused("Invalid command (empty).", started);
  }

  return await new Promise<HiddenTestResult>((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: options.repoPath,
      shell: false,
      env: { ...process.env, CI: "1" },
    });

    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs ?? 120_000);

    const collect = (chunk: Buffer | string): void => {
      if (output.length < MAX_OUTPUT_CHARS) {
        output += String(chunk);
      }
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);

    child.on("error", (error: Error) => {
      clearTimeout(timer);
      resolve({
        executed: false,
        exitCode: null,
        timedOut: false,
        filesPresent: true,
        missingFiles: [],
        output: `${output}\n${error.message}`.slice(0, MAX_OUTPUT_CHARS),
        durationMs: Date.now() - started,
        reason: `Failed to start test command: ${error.message}`,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        executed: !timedOut,
        exitCode: code,
        timedOut,
        filesPresent: true,
        missingFiles: [],
        output: output.slice(0, MAX_OUTPUT_CHARS),
        durationMs: Date.now() - started,
        ...(timedOut ? { reason: `Timed out after ${options.timeoutMs ?? 120_000}ms` } : {}),
      });
    });
  });
}

function refused(reason: string, started: number): HiddenTestResult {
  return {
    executed: false,
    exitCode: null,
    timedOut: false,
    filesPresent: false,
    missingFiles: [],
    output: "",
    durationMs: Date.now() - started,
    reason,
  };
}

/** Whether a hidden-test run counts as task completion. */
export function hiddenTestsPassed(result: HiddenTestResult): boolean {
  return result.executed && !result.timedOut && result.exitCode === 0;
}
