import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
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
  public readonly name = "opencode" as const;

  private readonly openCodeBin: string;
  private readonly model: string;
  private readonly openCodeConfigPath: string;

  public constructor(options?: {
    readonly openCodeBin?: string | undefined;
    readonly model?: string | undefined;
  }) {
    this.openCodeBin = options?.openCodeBin ?? "opencode";
    this.model = options?.model ?? "opencode/deepseek-v4-flash-free";
    this.openCodeConfigPath = join(homedir(), ".config", "opencode", "opencode.json");
  }

  public async execute(request: RunnerRequest): Promise<Result<RunnerResult>> {
    let configBackup: string | null = null;

    if (request.mode === "codeatlas") {
      configBackup = await this.updateGlobalConfigForRepo(request.repositoryPath);
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
        "--dir",
        request.repositoryPath,
        request.prompt,
      ];

      const start = performance.now();
      const res = await this.spawnAsync(args, {
        cwd: request.repositoryPath,
        timeoutMs: request.timeoutMs,
        env,
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

  private async updateGlobalConfigForRepo(repoPath: string): Promise<string | null> {
    if (!existsSync(this.openCodeConfigPath)) return null;
    const original = readFileSync(this.openCodeConfigPath, "utf-8");
    const config = JSON.parse(original);
    if (config.mcp?.codeatlas) {
      config.mcp.codeatlas.environment = { ATLAS_ROOT: repoPath };
      writeFileSync(this.openCodeConfigPath, JSON.stringify(config, null, 2));
    }
    return original;
  }

  private spawnAsync(
    args: string[],
    options: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
  ): Promise<{ code: number | null; lines: string[]; timedOut: boolean; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(this.openCodeBin, args, {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: options.env,
      });

      const lines: string[] = [];
      let stderr = "";
      let buffer = "";

      const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs);

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
        if (buffer.trim() !== "") lines.push(buffer.trim());
        resolve({ code, lines, timedOut: signal === "SIGKILL", stderr });
      });

      child.on("error", () => {
        clearTimeout(timer);
        resolve({ code: null, lines, timedOut: false, stderr });
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Event parsing (ported from benchmarks/final-2026-08/run-benchmark.mjs)
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
