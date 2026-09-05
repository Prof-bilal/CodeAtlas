import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BenchmarkAgent,
  BenchmarkRunner,
  RunnerRequest,
  RunnerResult,
  TokenMetrics,
  ToolCallRecord,
} from "@atlas/core";
import { type Result, ok } from "@atlas/shared";

/**
 * Runner that executes tasks via `opencode run --format json`.
 *
 * Spawns opencode as a child process, parses JSONL event streams for
 * token/cost/latency metrics, and returns structured results.
 */
export class OpenCodeRunner implements BenchmarkRunner {
  public readonly name: BenchmarkAgent;

  private readonly openCodeBin: string;
  private readonly model: string;
  private readonly openCodeConfigPath: string;

  public constructor(options?: {
    readonly openCodeBin?: string | undefined;
    readonly model?: string | undefined;
    /** Runner identity (`"opencode"` default; `"kilo"` for the Kilo fork). */
    readonly name?: BenchmarkAgent | undefined;
    /**
     * Global config file the CLI toggles the CodeAtlas MCP entry in. Defaults
     * to opencode's; Kilo uses `~/.config/kilo/kilo.jsonc`.
     */
    readonly configPath?: string | undefined;
    /**
     * Kilo's `run` has no `--dir` flag (it uses cwd); opencode requires it.
     */
    readonly omitDirFlag?: boolean | undefined;
  }) {
    this.openCodeBin = options?.openCodeBin ?? "opencode";
    this.model = options?.model ?? "opencode/deepseek-v4-flash-free";
    this.name = options?.name ?? "opencode";
    this.omitDirFlag = options?.omitDirFlag ?? false;
    this.openCodeConfigPath =
      options?.configPath ?? join(homedir(), ".config", "opencode", "opencode.json");
  }

  private readonly omitDirFlag: boolean;

  public async execute(request: RunnerRequest): Promise<Result<RunnerResult>> {
    if (request.signal?.aborted) {
      return ok({
        metrics: emptyMetrics(),
        cost: 0,
        durationMs: 0,
        timedOut: false,
        exitCode: null,
        finalText: "",
        toolCalls: [],
        error: "cancelled",
      });
    }

    let configBackup: string | null = null;

    // For every mode we may need to toggle the CodeAtlas MCP server in the
    // global opencode config: baseline must run WITHOUT it (a true baseline),
    // while context modes enable it pointed at the correct repo.
    if (
      request.mode === "baseline" ||
      request.mode === "codeatlas" ||
      request.mode === "codeatlas-intel"
    ) {
      configBackup = this.configureGlobalConfig(request.repositoryPath, request.mode);
    }

    try {
      const env = { ...process.env };

      const model = request.model ?? this.model;
      const args = [
        "run",
        "--format",
        "json",
        "--model",
        model,
        ...(this.omitDirFlag ? [] : ["--dir", request.repositoryPath]),
        request.prompt,
      ];

      const start = performance.now();
      const res = await this.spawnAsync(args, {
        cwd: request.repositoryPath,
        timeoutMs: request.timeoutMs,
        env,
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      });
      const wallMs = Math.round(performance.now() - start);

      const parsed = parseRunEvents(res.lines);

      const toolCalls: ToolCallRecord[] = parsed.toolCalls.map((tc) => ({
        name: tc.tool,
        callId: tc.callID ?? undefined,
        status: tc.isError ? "error" : "success",
        durationMs: tc.durationMs ?? undefined,
        isError: tc.isError,
      }));

      const metrics: TokenMetrics = {
        input: parsed.metrics.input,
        output: parsed.metrics.output,
        reasoning: parsed.metrics.reasoning,
        total: parsed.metrics.total,
        cacheWrite: parsed.metrics.cacheWrite,
        cacheRead: parsed.metrics.cacheRead,
        source: parsed.metrics.total > 0 ? "actual" : "unknown",
      };

      return ok({
        metrics,
        cost: parsed.metrics.cost,
        durationMs: wallMs,
        timedOut: res.timedOut,
        exitCode: res.code,
        finalText: parsed.finalText,
        toolCalls,
        error:
          res.code !== 0 && !res.timedOut
            ? `exit code ${res.code}${res.stderr ? `: ${res.stderr.slice(0, 500)}` : ""}`
            : undefined,
        stderr: res.stderr,
      });
    } finally {
      if (configBackup !== null) {
        writeFileSync(this.openCodeConfigPath, configBackup);
      }
    }
  }

  /**
   * Rewrite the CodeAtlas MCP entry in the global opencode config for the
   * requested mode, returning the original file content for restoration after
   * the run.
   *
   * - `baseline`: disable the CodeAtlas MCP (a true baseline — the model must
   *   not receive repository context tools).
   * - `codeatlas` / `codeatlas-intel`: enable it and point `ATLAS_ROOT` at the
   *   repository under test. Other MCP servers in the config (e.g. typeui) are
   *   preserved untouched.
   */
  private configureGlobalConfig(
    repoPath: string,
    mode: "baseline" | "codeatlas" | "codeatlas-intel",
  ): string | null {
    if (!existsSync(this.openCodeConfigPath)) return null;
    const original = readFileSync(this.openCodeConfigPath, "utf-8");
    const config = JSON.parse(original) as Record<string, unknown>;
    config["mcp"] ??= {};
    const mcp = config["mcp"] as Record<string, unknown>;
    const enable = mode !== "baseline";

    if (mcp["codeatlas"] !== undefined) {
      const entry = mcp["codeatlas"] as Record<string, unknown>;
      entry["enabled"] = enable;
      if (enable) {
        entry["environment"] ??= {};
        const env = entry["environment"] as Record<string, unknown>;
        env["ATLAS_ROOT"] = repoPath;
        this.forwardBudgetEnv(env);
      }
    } else if (enable) {
      // Best-effort: create the entry if missing, reusing the built MCP server.
      const here = dirname(
        typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url),
      );
      const env: Record<string, unknown> = {
        ATLAS_ROOT: repoPath,
      };
      this.forwardBudgetEnv(env);
      mcp["codeatlas"] = {
        type: "local",
        command: ["node", resolve(here, "..", "..", "..", "mcp", "dist", "bin.js")],
        environment: env,
        enabled: true,
      };
    }

    writeFileSync(this.openCodeConfigPath, JSON.stringify(config, null, 2));
    return original;
  }

  /**
   * Forward the tool-call budget env vars (if the benchmark operator sets
   * them) into the CodeAtlas MCP server's environment. This is what carries
   * the per-session `ToolCallBudget` from the runner to the opencod / kilo /
   * any-MCP-client path — the shared choke point in `packages/mcp` — instead
   * of bounding only the in-process ollama tool loop.
   */
  private forwardBudgetEnv(env: Record<string, unknown>): void {
    for (const key of [
      "ATLAS_MCP_MAX_TOOL_CALLS",
      "ATLAS_MCP_MAX_READ_RANGE_CALLS",
      "ATLAS_CONTEXT_MODE",
    ] as const) {
      const raw = process.env[key];
      if (raw !== undefined) {
        env[key] = raw;
      }
    }
  }

  private spawnAsync(
    args: string[],
    options: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv; signal?: AbortSignal },
  ): Promise<{ code: number | null; lines: string[]; timedOut: boolean; stderr: string }> {
    return new Promise((resolve) => {
      // `detached: true` makes opencode a process-group leader so the timeout
      // can kill the *whole* tree (opencode + its MCP grandchildren) with a
      // negative-pid signal. Without this, killing only the opencode child
      // leaves grandchildren alive holding the inherited stdout/stderr pipe
      // write-ends open, which prevents Node's `close` event from ever firing
      // and hangs the promise indefinitely.
      const child = spawn(this.openCodeBin, args, {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: options.env,
        detached: true,
      });

      const lines: string[] = [];
      let stderr = "";
      let buffer = "";
      let timedOut = false;

      const killTree = () => {
        const pgid = child.pid;
        if (pgid !== undefined) {
          try {
            // Negative PID signals the whole process group (child + any
            // grandchildren that inherited the pipe, e.g. MCP servers).
            process.kill(-pgid, "SIGKILL");
            return;
          } catch {
            /* group may already be gone — fall through to direct kill */
          }
        }
        try {
          child.kill("SIGKILL");
        } catch {
          /* already exited */
        }
      };

      const onAbort = (): void => {
        killTree();
      };
      options.signal?.addEventListener("abort", onAbort);

      const timer = setTimeout(() => {
        timedOut = true;
        killTree();
        // Resolve directly so we never hang on a `close` event that is waiting
        // on grandchildren that held the pipe open.
        if (buffer.trim() !== "") lines.push(buffer.trim());
        resolve({ code: null, lines, timedOut, stderr });
      }, options.timeoutMs);

      child.stdout.on("data", (d: Buffer) => {
        const text = String(d);
        buffer += text;
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          const trimmed = line.trim();
          if (trimmed !== "") lines.push(trimmed);
        }
      });

      child.stderr.on("data", (d: Buffer) => {
        stderr += String(d);
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        if (buffer.trim() !== "") lines.push(buffer.trim());
        resolve({
          code,
          lines,
          timedOut: timedOut || signal === "SIGKILL",
          stderr,
        });
      });

      child.on("error", () => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        resolve({ code: null, lines, timedOut, stderr });
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Event parsing (ported from old-school benchmark harness)
// ---------------------------------------------------------------------------

interface RawEvent {
  type?: string;
  timestamp?: number;
  part?: {
    tokens?: {
      input?: number;
      output?: number;
      reasoning?: number;
      total?: number;
      cache?: { write?: number; read?: number };
    };
    text?: string;
    tool?: string;
    callID?: string;
    input?: unknown;
    state?: {
      status?: string;
      output?: unknown;
      isError?: boolean;
    };
    time?: {
      start?: number;
      end?: number;
    };
  };
  cost?: number;
}

interface ParsedMetrics {
  input: number;
  output: number;
  reasoning: number;
  total: number;
  cacheWrite: number;
  cacheRead: number;
  cost: number;
  steps: number;
}

interface ParsedToolCall {
  tool: string;
  callID: string | undefined;
  isError: boolean;
  durationMs: number | undefined;
  output: unknown;
}

function parseRunEvents(lines: string[]): {
  metrics: ParsedMetrics;
  finalText: string;
  toolCalls: ParsedToolCall[];
} {
  const metrics: ParsedMetrics = {
    input: 0,
    output: 0,
    reasoning: 0,
    total: 0,
    cacheWrite: 0,
    cacheRead: 0,
    cost: 0,
    steps: 0,
  };
  const texts: string[] = [];
  const toolCalls: ParsedToolCall[] = [];

  for (const line of lines) {
    let ev: RawEvent;
    try {
      ev = JSON.parse(line) as RawEvent;
    } catch {
      continue;
    }

    if (ev.type === "step_finish") {
      const t = ev.part?.tokens;
      if (t !== undefined) {
        metrics.input += t.input ?? 0;
        metrics.output += t.output ?? 0;
        metrics.reasoning += t.reasoning ?? 0;
        metrics.total += t.total ?? 0;
        metrics.cacheWrite += t.cache?.write ?? 0;
        metrics.cacheRead += t.cache?.read ?? 0;
        metrics.cost += ev.cost ?? 0;
        metrics.steps += 1;
      }
    }

    if (ev.type === "text" && typeof ev.part?.text === "string") {
      texts.push(ev.part.text);
    }

    if (ev.type === "tool_use") {
      const p = ev.part ?? {};
      const isError = p.state?.isError ?? false;
      toolCalls.push({
        tool: p.tool ?? "unknown",
        callID: p.callID,
        isError,
        durationMs:
          p.time?.start !== undefined && p.time?.end !== undefined
            ? Math.round(p.time.end - p.time.start)
            : undefined,
        output: p.state?.output ?? null,
      });
    }
  }

  return {
    metrics,
    finalText: texts[texts.length - 1] ?? "",
    toolCalls,
  };
}

function emptyMetrics(): TokenMetrics {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    total: 0,
    cacheWrite: 0,
    cacheRead: 0,
    source: "unknown",
  };
}
