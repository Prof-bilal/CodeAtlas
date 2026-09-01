/**
 * Per-session tool-call budget + attribution for the MCP server.
 *
 * Each MCP server process serves exactly one agent session (one opencod /
 * kilo / browser-benchmark run). Counters therefore reset with the server,
 * giving a natural per-run budget boundary — without any task-boundary
 * protocol the server would otherwise lack.
 *
 * Configuration is **env-gated and defaults to unlimited** so that enabling
 * this module never changes existing behavior unless an operator opts in.
 * This keeps it safe to land before the benchmark harness wiring (Phase A
 * measure-first): it only observes + attributes until a limit env var is set.
 *
 * Env vars (all default `0` = unlimited):
 *  - `ATLAS_MCP_MAX_TOOL_CALLS`          — global cap across every tool
 *  - `ATLAS_MCP_MAX_READ_RANGE_CALLS`    — cap for the `read_file_range` tool
 *
 * The attribution counters (call counts + bytes returned) feed the A5
 * "where did the tokens come from" dimension; see
 * `docs/benchmark.md` §"Tool-call attribution".
 */

/** Parsed, validated config for a {@link ToolCallBudget}. */
export interface ToolCallBudgetConfig {
  /** Global cap across *all* tools (`0` / undefined = unlimited). */
  readonly maxTotalCalls?: number | undefined;
  /** Cap for `read_file_range` (`0` / undefined = unlimited). */
  readonly maxReadRangeCalls?: number | undefined;
  /** Per-tool overrides (keyed by tool name) for ad-hoc caps. */
  readonly maxPerTool?: Record<string, number> | undefined;
}

/** Outcome of {@link ToolCallBudget.check}. */
export interface BudgetCheckResult {
  /** Whether the call is allowed to proceed. */
  readonly allowed: boolean;
  /** Human-readable reason when {@link allowed} is false. */
  readonly reason?: string;
  /** The limit that would be exceeded, if any. */
  readonly limit?: { tool: string; kind: "total" | "per-tool" };
}

/**
 * A mutable, session-scoped tally of tool calls and the bytes they returned.
 *
 * Instantiate one per MCP server (i.e. per agent session). `check` is
 * consulted *before* invoking a handler; `record` is called *after* the
 * handler returns. `snapshot` yields the attribution used in audit reports.
 */
export class ToolCallBudget {
  readonly config: ToolCallBudgetConfig;
  private total = 0;
  private perTool = new Map<string, { calls: number; bytes: number }>();

  constructor(config: ToolCallBudgetConfig = {}) {
    this.config = {
      maxTotalCalls: config.maxTotalCalls,
      maxReadRangeCalls: config.maxReadRangeCalls,
      maxPerTool: config.maxPerTool,
    };
  }

  /** True when *any* limit has been exhausted and the session is saturated. */
  get exhausted(): boolean {
    if (this.config.maxTotalCalls && this.total >= this.config.maxTotalCalls) {
      return true;
    }
    for (const tool of this.perTool.keys()) {
      const cap = this.resolveCap(tool);
      if (cap !== undefined && (this.perTool.get(tool)?.calls ?? 0) >= cap) {
        return true;
      }
    }
    return false;
  }

  /**
   * Test a tool call against the configured limits *before* executing it.
   * Does **not** mutate counters.
   */
  check(tool: string): BudgetCheckResult {
    if (this.config.maxTotalCalls && this.total >= this.config.maxTotalCalls) {
      return {
        allowed: false,
        reason: `tool-call budget exhausted (max ${this.config.maxTotalCalls} per session)`,
        limit: { tool, kind: "total" },
      };
    }
    const cap = this.resolveCap(tool);
    if (cap !== undefined) {
      const cur = this.perTool.get(tool)?.calls ?? 0;
      if (cur >= cap) {
        return {
          allowed: false,
          reason: `${tool} call budget exhausted (max ${cap} per session)`,
          limit: { tool, kind: "per-tool" },
        };
      }
    }
    return { allowed: true };
  }

  /** Record a completed call and its output size (for attribution). */
  record(tool: string, outputBytes: number): void {
    this.total++;
    const entry = this.perTool.get(tool) ?? { calls: 0, bytes: 0 };
    entry.calls++;
    entry.bytes += outputBytes;
    this.perTool.set(tool, entry);
  }

  /** Per-session attribution snapshot (consumed by audit/reporting). */
  snapshot(): ToolCallBudgetSnapshot {
    const perTool: Record<string, ToolCallBudgetEntry> = {};
    for (const [tool, v] of this.perTool.entries()) {
      perTool[tool] = { calls: v.calls, bytes: v.bytes };
    }
    return { totalCalls: this.total, perTool };
  }

  private resolveCap(tool: string): number | undefined {
    const explicit = this.config.maxPerTool?.[tool];
    if (explicit !== undefined) {
      return explicit;
    }
    if (tool === "read_file_range") {
      return this.config.maxReadRangeCalls;
    }
    return undefined;
  }
}

/** One entry in {@link ToolCallBudgetSnapshot.perTool}. */
export interface ToolCallBudgetEntry {
  readonly calls: number;
  readonly bytes: number;
}

/** A point-in-time read-only view of a {@link ToolCallBudget}. */
export interface ToolCallBudgetSnapshot {
  readonly totalCalls: number;
  readonly perTool: Record<string, ToolCallBudgetEntry>;
}

/** Read `ToolCallBudgetConfig` from the process environment. */
export function readBudgetConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): ToolCallBudgetConfig {
  const get = (key: string): number | undefined => {
    const raw = env[key];
    if (raw === undefined || raw === "") {
      return undefined;
    }
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return {
    maxTotalCalls: get("ATLAS_MCP_MAX_TOOL_CALLS"),
    maxReadRangeCalls: get("ATLAS_MCP_MAX_READ_RANGE_CALLS"),
  };
}

/** Create a session budget configured from the environment. */
export function createToolCallBudget(
  env: Record<string, string | undefined> = process.env,
): ToolCallBudget {
  return new ToolCallBudget(readBudgetConfigFromEnv(env));
}
