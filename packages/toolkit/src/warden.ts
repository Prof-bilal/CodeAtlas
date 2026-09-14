import { spawn } from "node:child_process";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { findExecutable } from "./environment";

export interface WardenStatus {
  readonly installed: boolean;
  readonly path: string | null;
  readonly enabled: boolean;
  readonly note: string;
}

export interface WardenRunRequest {
  readonly policyPath: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

export interface WardenRunPlan {
  readonly binary: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly policyPath: string;
}

export interface WardenRunResult {
  readonly plan: WardenRunPlan;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export interface WardenServiceOptions {
  readonly resolveBinary?: () => string | null;
  readonly maxOutputChars?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_TIMEOUT_MS = 3_600_000;
const DEFAULT_MAX_OUTPUT_CHARS = 64 * 1024;

export class WardenService {
  private readonly resolveBinary: () => string | null;
  private readonly maxOutputChars: number;

  public constructor(options: WardenServiceOptions = {}) {
    this.resolveBinary = options.resolveBinary ?? (() => findExecutable("warden"));
    this.maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  }

  public status(): WardenStatus {
    const path = this.resolveBinary();
    return {
      installed: path !== null,
      path,
      enabled: false,
      note:
        path === null
          ? "Warden is not installed; no sandbox is active."
          : "Warden is available but remains opt-in until an explicit sandboxed run is requested.",
    };
  }

  public plan(request: WardenRunRequest): WardenRunPlan {
    const binary = this.resolveBinary();
    if (binary === null) throw new Error("Warden is not installed or not available on PATH.");
    const cwd = resolve(request.cwd ?? process.cwd());
    const policyPath = resolve(cwd, request.policyPath);
    let policyStat: ReturnType<typeof lstatSync>;
    try {
      policyStat = lstatSync(policyPath);
    } catch {
      throw new Error(`Warden policy does not exist: ${policyPath}`);
    }
    if (!policyStat.isFile() || policyStat.isSymbolicLink()) {
      throw new Error(`Warden policy must be a regular file: ${policyPath}`);
    }
    if (request.command.trim().length === 0) throw new Error("Warden command must not be empty.");
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new Error(`Warden timeout must be an integer between 1 and ${MAX_TIMEOUT_MS} ms.`);
    }
    return {
      binary,
      args: ["run", "--policy", policyPath, "--", request.command, ...(request.args ?? [])],
      cwd,
      policyPath,
    };
  }

  public async run(request: WardenRunRequest): Promise<WardenRunResult> {
    const plan = this.plan(request);
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise((resolveResult, reject) => {
      const child = spawn(plan.binary, [...plan.args], {
        cwd: plan.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      const append = (current: string, chunk: Buffer): string => {
        const next = current + chunk.toString("utf8");
        return next.length > this.maxOutputChars
          ? `${next.slice(0, this.maxOutputChars)}\n[output truncated]`
          : next;
      };
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = append(stdout, chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = append(stderr, chunk);
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new Error(`Warden process failed to start: ${error.message}`));
        }
      });
      child.once("close", (exitCode, signal) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolveResult({ plan, exitCode, signal, timedOut, stdout, stderr });
      });
    });
  }
}

export function createWardenService(options: WardenServiceOptions = {}): WardenService {
  return new WardenService(options);
}
