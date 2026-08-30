import { spawn as nodeSpawn } from "node:child_process";
import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { CommandRunResult, VerifyCommandConfig, VerifyConfig } from "@atlas/core";

const MAX_OUTPUT_BYTES = 1 * 1024 * 1024; // 1 MiB
const DEFAULT_TIMEOUT_MS = 60_000;

function validateArgs(args: readonly string[]): void {
  for (const arg of args) {
    if (typeof arg !== "string") {
      throw new TypeError("All arguments must be strings");
    }
    if (arg.length > 512) {
      throw new Error(`Argument too long (${arg.length} > 512): ${arg.slice(0, 50)}...`);
    }
    if (arg.startsWith("-")) {
      throw new Error(`Flag injection rejected: ${arg}`);
    }
    /* eslint-disable no-control-regex */
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control chars for security
    if (/[\x00-\x1f\x7f]/.test(arg)) {
      throw new Error(`Control characters rejected in argument: ${arg.slice(0, 20)}`);
    }
    /* eslint-enable no-control-regex */
  }
}

function resolveCommand(command: string, cwd: string): { resolved: string; isAbsolute: boolean } {
  if (isAbsolute(command)) {
    if (!existsSync(command)) {
      throw new Error(`Absolute command path does not exist: ${command}`);
    }
    return { resolved: command, isAbsolute: true };
  }

  // Resolve relative to cwd
  const resolved = resolve(cwd, command);
  if (existsSync(resolved)) {
    return { resolved, isAbsolute: true };
  }

  // Try PATH resolution (just validate it's a simple name)
  if (/^[a-z0-9._-]+$/i.test(command)) {
    return { resolved: command, isAbsolute: false };
  }

  throw new Error(`Command "${command}" is not absolute and not a simple executable name`);
}

function existsSync(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function truncate(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf-8");
  if (buf.length <= maxBytes) return s;
  return `${buf.subarray(0, maxBytes).toString("utf-8")}\n[truncated]`;
}

export interface CommandRunnerDeps {
  /** Injected spawn for testing (defaults to node:child_process.spawn). */
  readonly spawnFn?: (
    command: string,
    args: readonly string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; shell: boolean },
  ) => {
    pid?: number;
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    kill: (signal?: string) => void;
  };
  /** Logger for user-visible command output. */
  readonly log?: (msg: string) => void;
}

function runSingleCommand(
  config: VerifyCommandConfig,
  cwd: string,
  deps: CommandRunnerDeps,
): Promise<CommandRunResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    validateArgs(config.args);

    const { resolved } = resolveCommand(config.command, cwd);
    deps.log?.(`[verify] Running: ${config.command} ${config.args.join(" ")}`);

    const spawnFn =
      deps.spawnFn ??
      ((
        cmd: string,
        args: readonly string[],
        opts: { cwd?: string; env?: NodeJS.ProcessEnv; shell: boolean },
      ) => {
        return nodeSpawn(cmd, [...args], opts);
      });

    const handle = spawnFn(resolved, [...config.args], {
      cwd,
      env: process.env,
      shell: false, // ALWAYS false — argv-array, never shell string
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    handle.stdout.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    });

    handle.stderr.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    });

    const timer = setTimeout(() => {
      timedOut = true;
      handle.kill("SIGTERM");
    }, timeoutMs);

    handle.on("close", (code: number | null) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      resolve({
        command: config.command,
        args: [...config.args],
        exitCode: code ?? 1,
        stdout: truncate(stdout, MAX_OUTPUT_BYTES),
        stderr: truncate(stderr, MAX_OUTPUT_BYTES),
        timedOut,
        durationMs,
        preExisting: false,
      });
    });

    handle.on("error", (err: Error) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      resolve({
        command: config.command,
        args: [...config.args],
        exitCode: 1,
        stdout: "",
        stderr: `Process error: ${err.message}`,
        timedOut: false,
        durationMs,
        preExisting: false,
      });
    });
  });
}

export async function runCommands(
  config: VerifyConfig,
  cwd: string,
  deps: CommandRunnerDeps = {},
): Promise<readonly CommandRunResult[]> {
  if (!config.enabled) {
    return [];
  }

  const results: CommandRunResult[] = [];

  for (const [category, cmdConfig] of Object.entries(config.commands)) {
    try {
      const result = await runSingleCommand(cmdConfig, cwd, deps);
      results.push(result);
    } catch (err) {
      results.push({
        command: cmdConfig.command,
        args: [...cmdConfig.args],
        exitCode: 1,
        stdout: "",
        stderr: `Failed to run ${category}: ${err instanceof Error ? err.message : String(err)}`,
        timedOut: false,
        durationMs: 0,
        preExisting: false,
      });
    }
  }

  return results;
}
