import type { Result } from "@atlas/shared";
import type { ToolDefinition } from "./provider.port";

/**
 * Benchmark contract — declarative evaluation harness for measuring
 * CodeAtlas context quality against a baseline.
 *
 * Suites contain tasks with expected files/concepts. Runners execute tasks
 * through an AI agent (opencode CLI or Ollama direct), evaluate accuracy
 * automatically, and persist results as JSON. Reports are Markdown.
 *
 * All data stays local in `.codeatlas/benchmarks/`.
 */
export interface BenchmarkPort {
  /** Create a new benchmark suite from configuration. */
  initSuite(config: BenchmarkConfig): Promise<Result<BenchmarkSuite>>;
  /** Load an existing suite by id. */
  loadSuite(suiteId: string): Promise<Result<BenchmarkSuite>>;
  /** List all known suites. */
  listSuites(): Promise<Result<BenchmarkSuite[]>>;
  /** Run a single task in a suite. */
  runTask(request: BenchmarkRunRequest): Promise<Result<BenchmarkTaskResult>>;
  /** Run all tasks in a suite (both modes unless restricted). */
  runSuite(request: BenchmarkSuiteRunRequest): Promise<Result<BenchmarkSuiteResult>>;
  /** Get current progress/status of a suite. */
  getStatus(suiteId: string): Promise<Result<BenchmarkStatus>>;
  /** Generate a report for a completed suite. */
  generateReport(suiteId: string, options?: ReportOptions): Promise<Result<BenchmarkReport>>;
  /** Cancel a running or queued benchmark suite. Stops in-flight tasks early. */
  cancelSuite(suiteId: string): Promise<Result<BenchmarkCancelResult>>;
  /** Close underlying resources. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Supported AI agent backends for task execution. */
export type BenchmarkAgent = "opencode" | "ollama" | "kilo";

/** Comparison mode: baseline (no MCP) vs CodeAtlas (with MCP context). */
export type BenchmarkMode = "baseline" | "codeatlas" | "codeatlas-intel";

/** Top-level benchmark configuration. */
export interface BenchmarkConfig {
  /** Unique human-readable id (e.g. "final-2026-08"). */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Agent backend to use. */
  readonly agent: BenchmarkAgent;
  /** Model identifier (e.g. "opencode/deepseek-v4-flash-free", "ollama/llama3.2"). */
  readonly model: string;
  /**
   * Multiple model identifiers for matrix runs (P8.1).
   * When present, the suite runs each task against every model × every mode.
   * Overrides `model` for matrix expansion.
   */
  readonly models?: readonly string[];
  /** Modes to run (both by default). */
  readonly modes: readonly BenchmarkMode[];
  /** Agent-specific options. */
  readonly agentOptions?: AgentOptions;
  /** Per-task timeout in milliseconds (default: 540_000 = 9 minutes). */
  readonly taskTimeoutMs?: number;
  /** Number of runs per task per mode (default: 1). */
  readonly runsPerTask?: number;
  /** Ablation toggles (P8.2) — disables intel features per run. */
  readonly ablation?: BenchmarkAblationConfig;
  /** Per-provider default budget overrides (P8.3). */
  readonly budgetDefaults?: ModelBudgetDefaults;
}

/** Agent-specific configuration overrides. */
export interface AgentOptions {
  /** OpenCode-specific: provider name override. */
  readonly provider?: string;
  /** OpenCode-specific: temperature override. */
  readonly temperature?: number;
  /** Ollama-specific: base URL override. */
  readonly baseUrl?: string;
}

/**
 * Ablation configuration for Phase 8 (P8.2).
 *
 * Each toggle disables one intel feature so we can measure its individual
 * contribution. When a toggle is `false`, the runner executes the task
 * *without* that feature (equivalent to a lower-complexity mode).
 *
 * All default to `true` (feature enabled). Setting any to `false` produces
 * an ablated run.
 */
export interface BenchmarkAblationConfig {
  /** Disable the plan-step injection (P1).* */
  readonly disablePlanner?: boolean;
  /** Disable hierarchy-based search ranking (P2).* */
  readonly disableHierarchy?: boolean;
  /** Disable verification / feedback loop (P5).* */
  readonly disableVerification?: boolean;
  /** Disable the AI critic pass (P6).* */
  readonly disableCritic?: boolean;
  /** Disable the static digest (P7).* */
  readonly disableDigest?: boolean;
}

/**
 * Per-provider default budget configuration (P8.3).
 *
 * Recommended token budgets and cost limits for each provider when running
 * benchmark tasks. Used to prevent runaway costs and to set sane defaults
 * for local models.
 */
export interface ModelBudgetDefaults {
  /** Maximum total tokens per task run (0 = unlimited). */
  readonly maxTokensPerTask?: number;
  /** Maximum cost per task run in USD (0 = unlimited). */
  readonly maxCostPerTask?: number;
  /** Maximum wall-clock time per task run in milliseconds. */
  readonly maxDurationMs?: number;
  /** Provider-specific overrides keyed by provider name. */
  readonly perProvider?: Readonly<
    Record<
      string,
      {
        readonly maxTokensPerTask?: number;
        readonly maxCostPerTask?: number;
        readonly maxDurationMs?: number;
      }
    >
  >;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

/** A benchmark suite — a named collection of tasks for one or more repositories. */
export interface BenchmarkSuite {
  /** Unique suite identifier. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Configuration used to create this suite. */
  readonly config: BenchmarkConfig;
  /** ISO timestamp of suite creation. */
  readonly createdAt: string;
  /** Current suite status. */
  readonly status: SuiteStatus;
  /** Task file paths (absolute paths to JSON task definitions). */
  readonly taskFiles: readonly string[];
}

/** Suite lifecycle status. */
export type SuiteStatus = "created" | "running" | "completed" | "failed" | "cancelled";

// ---------------------------------------------------------------------------
// Task definition (matches existing benchmark JSON format)
// ---------------------------------------------------------------------------

/** A task file containing one or more benchmark tasks for a repository. */
export interface TaskFile {
  /** Repository identifier (e.g. "repo-01"). */
  readonly repository: string;
  /** Repository display name. */
  readonly name: string;
  /** Repository version/tag. */
  readonly version: string;
  /** Number of files in the repository. */
  readonly files: number;
  /** Task definitions. */
  readonly tasks: readonly TaskDefinition[];
}

/** A single benchmark task. */
export interface TaskDefinition {
  /** Unique task identifier (e.g. "R1-T01"). */
  readonly id: string;
  /** Task category for grouping in reports. */
  readonly category: TaskCategory;
  /** The prompt sent to the AI agent. */
  readonly prompt: string;
  /** Files expected to be referenced in a correct answer. */
  readonly expected_files: readonly string[];
  /** Concepts expected to appear in a correct answer. */
  readonly expected_concepts: readonly string[];
  /** Description of the evaluation criteria. */
  readonly evaluation_method: string;
  /** Optional per-task timeout override in seconds. */
  readonly max_seconds?: number;
  /**
   * Repository-relative paths that a correct code-touching task must affect.
   * Enables wrong-file-rate evaluation (small-model intelligence benchmark,
   * Phase 0). Optional — absent for read/explain tasks.
   */
  readonly gold_impact_files?: readonly string[];
  /**
   * Repository-relative paths the agent must NOT propose changing. Enables
   * unnecessary-change detection. Optional.
   */
  readonly forbidden_changes?: readonly string[];
  /**
   * Repository-relative test files executed after the task to measure task
   * completion. Executed only via the explicit, allow-listed test runner
   * (ADR-015 policy) — never implicitly. Optional.
   */
  readonly hidden_tests?: readonly string[];
}

/** Task categories for classification and reporting. */
export type TaskCategory =
  | "repository-understanding"
  | "file-discovery"
  | "dependency-tracing"
  | "bug-investigation"
  | "feature-planning"
  | "code-modification"
  | "testing"
  | "cross-file-reasoning";

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** Request to run a single task. */
export interface BenchmarkRunRequest {
  /** Suite to run in. */
  readonly suiteId: string;
  /** Task identifier (must exist in one of the suite's task files). */
  readonly taskId: string;
  /** Mode to run (baseline or codeatlas). */
  readonly mode: BenchmarkMode;
  /** Repository path (absolute). */
  readonly repositoryPath: string;
  /** Optional timeout override. */
  readonly timeoutMs?: number | undefined;
  /** Optional model override for matrix expansion. */
  readonly model?: string | undefined;
}

/** Request to run an entire suite. */
export interface BenchmarkSuiteRunRequest {
  /** Suite to run. */
  readonly suiteId: string;
  /** Repository path (absolute). */
  readonly repositoryPath: string;
  /** Modes to run (defaults to suite config modes). */
  readonly modes?: readonly BenchmarkMode[] | undefined;
  /** If true, re-run tasks even if results exist. */
  readonly force?: boolean | undefined;
  /** Optional task ID filter — run only this task. */
  readonly taskId?: string | undefined;
  /**
   * Model identifiers for matrix expansion.
   * When present, each task × mode is run against every model.
   * Overrides `config.models` for this run.
   */
  readonly models?: readonly string[] | undefined;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Result of a single task run. */
export interface BenchmarkTaskResult {
  /** Task identifier. */
  readonly taskId: string;
  /** Task category. */
  readonly category: TaskCategory;
  /** Which mode produced this result. */
  readonly mode: BenchmarkMode;
  /** Agent backend used. */
  readonly agent: BenchmarkAgent;
  /** Model used. */
  readonly model: string;
  /** Token usage metrics. */
  readonly tokens: TokenMetrics;
  /** Cost in USD (0 for free-tier models). */
  readonly cost: number;
  /** Wall-clock duration in milliseconds. */
  readonly durationMs: number;
  /** Whether the task timed out. */
  readonly timedOut: boolean;
  /** Process exit code (for CLI runners). null for direct runners. */
  readonly exitCode: number | null;
  /** Final text response from the agent. */
  readonly finalText: string;
  /** Number of tool calls made. */
  readonly toolCallCount: number;
  /** Tool call details (for CodeAtlas mode). */
  readonly toolCalls: readonly ToolCallRecord[];
  /** Additive Phase A observability / attribution ledger. */
  readonly observability?: BenchmarkObservability;
  /** Failure classification derived from the evaluation and ledger. */
  readonly failureClassification?: FailureClassification;
  /** Evaluation result for this task (Phase B prerequisite). */
  readonly evaluation?: BenchmarkEvaluation;
  /** Sufficiency gate verdict for this task (Phase B B4). */
  readonly sufficiencyVerdict?: {
    readonly sufficient: boolean;
    readonly failures: readonly { readonly predicate: string; readonly message: string }[];
  };
  /** Why the tool loop terminated (Phase A5). */
  readonly stopReason?: string | undefined;
  /** Number of tool-loop rounds executed (Phase A5). */
  readonly roundCount?: number | undefined;
  /** Number of search queries served from dedup cache (Phase A5). */
  readonly dedupeHitCount?: number | undefined;
  /** Error message if the run failed. */
  readonly error?: string | undefined;
  /** Captured stderr from the runner process. */
  readonly stderr?: string | undefined;
  /** ISO timestamp of when this result was recorded. */
  readonly recordedAt: string;
}

/** Token usage breakdown. */
export interface TokenMetrics {
  /** Input/prompt tokens. */
  readonly input: number;
  /** Output/completion tokens. */
  readonly output: number;
  /** Reasoning tokens (if reported by provider). */
  readonly reasoning: number;
  /** Total tokens. */
  readonly total: number;
  /** Cache write tokens. */
  readonly cacheWrite: number;
  /** Cache read tokens. */
  readonly cacheRead: number;
  /** Token count source. */
  readonly source: "actual" | "estimated" | "unknown";
}

/** Record of a single tool call during a benchmark run. */
export interface ToolCallRecord {
  /** Tool name. */
  readonly name: string;
  /** Call identifier. */
  readonly callId?: string | undefined;
  /** Execution status. */
  readonly status: "success" | "error" | "unknown";
  /** Duration in milliseconds (if measured). */
  readonly durationMs?: number | undefined;
  /** Serialized tool output, when captured by the runner. */
  readonly output?: string | undefined;
  /** Estimated token count of the serialized tool output. */
  readonly outputTokens?: number | undefined;
  /** Whether the call produced an error. */
  readonly isError: boolean;
  /** 0-based tool-loop round this call occurred in. */
  readonly round?: number | undefined;
}

/** Status of a metric in the Phase A attribution ledger. */
export type BenchmarkMetricStatus = "measured" | "unavailable" | "not_instrumented";

/** One metric cell in the Phase A attribution ledger. */
export interface BenchmarkMetricValue {
  /** Numeric value when measured, else `null`. */
  readonly value: number | null;
  /** Whether the value is measured, unavailable, or not yet instrumented. */
  readonly status: BenchmarkMetricStatus;
  /** Optional explanatory note or owning file when absent. */
  readonly note?: string;
}

/** Canonical Phase A metric names used in the benchmark ledger/report. */
export type BenchmarkMetricName =
  | "success_rate"
  | "accuracy"
  | "total_tokens"
  | "system_prompt_tokens"
  | "repository_context_tokens"
  | "tool_output_tokens"
  | "repeated_context_tokens"
  | "duplicate_context_percent"
  | "unique_context_tokens"
  | "agent_message_tokens"
  | "reasoning_tokens"
  | "final_answer_input_tokens"
  | "final_answer_output_tokens"
  | "llm_call_count"
  | "tool_call_count"
  | "latency_ms"
  | "cache_read_tokens"
  | "cache_write_tokens";

/** One provider-call entry in the Phase A attribution ledger. */
export interface BenchmarkCallUsage {
  /** 1-based provider-call index. */
  readonly callIndex: number;
  /** 0-based round for tool-loop runs. */
  readonly round: number;
  /** Number of messages sent on this call. */
  readonly messageCount: number;
  /** Estimated transcript input tokens for this call. */
  readonly estimatedInputTokens: number;
  /** Fixed tool-schema overhead tokens on this call. */
  readonly toolSchemaTokens: number;
  /** Provider-reported input tokens, when available. */
  readonly inputTokens?: number;
  /** Provider-reported output tokens, when available. */
  readonly outputTokens?: number;
  /** Provider-reported total tokens, when available. */
  readonly totalTokens?: number;
}

/** One duplicate-content attribution bucket (Phase A6). */
export interface DuplicateAttributionBucket {
  /** Human-readable source label. */
  readonly source: string;
  /** Repo-wide A/B/C/D duplicate classification. */
  readonly classification: "A" | "B" | "C" | "D";
  /** Estimated duplicate tokens attributed to this source. */
  readonly tokens: number;
  /** Count of repeated instances for this source. */
  readonly count: number;
  /** Optional explanation. */
  readonly note?: string;
}

/** Additive per-task observability captured for Phase A. */
export interface BenchmarkObservability {
  /** Phase A metric ledger keyed by canonical metric name. */
  readonly metrics: Readonly<Partial<Record<BenchmarkMetricName, BenchmarkMetricValue>>>;
  /** Provider-call breakdown for the task run. */
  readonly providerCalls?: readonly BenchmarkCallUsage[];
  /** Tool-call count grouped by tool name. */
  readonly toolCallsByTool?: Readonly<Record<string, number>>;
  /** Tool-output tokens grouped by tool name. */
  readonly toolOutputTokensByTool?: Readonly<Record<string, number>>;
  /** Duplicate-content attribution buckets. */
  readonly duplicateBuckets?: readonly DuplicateAttributionBucket[];
  /** Total transcript messages retained at the end of the run. */
  readonly transcriptMessageCount?: number;
  /** Estimated transcript tokens retained at the end of the run. */
  readonly transcriptEstimatedTokens?: number;
  /** Count of repeated file/path-oriented tool reads. */
  readonly repeatedFileCount?: number;
}

/** Phase A failure-classification labels. */
export type FailureCategory =
  | "budget_truncation"
  | "lexical_miss"
  | "context_overload"
  | "tool_loop_underuse"
  | "insufficient_signal";

/** One task's failure classification (Phase A2). */
export interface FailureClassification {
  /** Classified failure category. */
  readonly category: FailureCategory;
  /** Short evidence summary for the classification. */
  readonly reason: string;
  /** Concrete next fix to test. */
  readonly proposedFix: string;
}

/** Evaluation result for a single task. */
export interface BenchmarkEvaluation {
  /** Automated score (0 = incorrect/failed, 1 = partial, 2 = correct). */
  readonly score: number;
  /** Evaluation status label. */
  readonly status: "correct" | "partially_correct" | "incorrect" | "failed";
  /** Expected files that were found in the response. */
  readonly filesFound: readonly string[];
  /** All expected files. */
  readonly filesExpected: readonly string[];
  /** Ratio of files found (0.0 – 1.0). */
  readonly fileRatio: number;
  /** Concepts that were found in the response. */
  readonly conceptsFound: readonly string[];
  /** All expected concepts. */
  readonly conceptsExpected: readonly string[];
  /** Ratio of concepts found (0.0 – 1.0). */
  readonly conceptRatio: number;
  /** Repository-relative paths cited by the agent that exist on disk. */
  readonly citedFiles: readonly string[];
  /**
   * Repository-relative paths cited by the agent that do NOT exist on disk
   * (hallucinated paths). Present only when at least one path-like string is
   * cited; empty when the agent cited no paths.
   */
  readonly hallucinatedFiles?: readonly string[];
  /**
   * Cited paths that exist on disk but are NOT in the task's
   * `gold_impact_files` (wrong-file signal). Present only when the task
   * declares `gold_impact_files`.
   */
  readonly wrongFiles?: readonly string[];
  /** The task's `gold_impact_files`, when declared. */
  readonly goldImpactFiles?: readonly string[];
}

/** Aggregate result for a full suite run. */
export interface BenchmarkSuiteResult {
  /** Suite identifier. */
  readonly suiteId: string;
  /** Per-task results. */
  readonly tasks: readonly BenchmarkTaskResult[];
  /** Per-task evaluations (indexed by taskId + mode). */
  readonly evaluations: readonly BenchmarkEvaluationEntry[];
  /** Aggregate token savings (baseline total − codeatlas total). */
  readonly tokenSavings: number;
  /** Aggregate cost savings. */
  readonly costSavings: number;
  /** Aggregate accuracy delta (codeatlas avg score − baseline avg score). */
  readonly accuracyDelta: number;
  /** ISO timestamp. */
  readonly completedAt: string;
  /**
   * Retrieval-quality report (recall@k / precision@k / MRR), populated when
   * the benchmark service was constructed with a retrieval evaluator.
   * Absent when retrieval could not be scored (no index, no evaluator).
   */
  readonly retrieval?: BenchmarkRetrievalReport;
}

/** Retrieval-quality report attached to a suite result (L8 / Phase B). */
export interface BenchmarkRetrievalReport {
  /** Per-task retrieval scores. */
  readonly tasks: readonly BenchmarkRetrievalTaskResult[];
  /** Precision@k averaged across tasks. */
  readonly precisionAtK: Readonly<Record<number, number>>;
  /** Recall@k averaged across tasks. */
  readonly recallAtK: Readonly<Record<number, number>>;
  /** Mean reciprocal rank across tasks. */
  readonly meanReciprocalRank: number;
}

/** One task's retrieval-quality measurement inside a suite report. */
export interface BenchmarkRetrievalTaskResult {
  readonly taskId: string;
  readonly category: string;
  readonly hitsAtK: Readonly<Record<number, number>>;
  readonly relevant: number;
  readonly retrievedPaths: readonly string[];
  readonly ranks: Readonly<Record<string, number | null>>;
}

/** An evaluation entry tied to a specific task and mode. */
export interface BenchmarkEvaluationEntry {
  readonly taskId: string;
  readonly mode: BenchmarkMode;
  readonly evaluation: BenchmarkEvaluation;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Current status/progress of a benchmark suite. */
export interface BenchmarkStatus {
  readonly suiteId: string;
  readonly status: SuiteStatus;
  /** Number of completed task runs. */
  readonly completed: number;
  /** Total task runs expected. */
  readonly total: number;
  /** Currently running task (if any). */
  readonly currentTask?: string | undefined;
  /** ISO timestamp of last update. */
  readonly updatedAt: string;
}

/** Result of a cancel-suite request. */
export interface BenchmarkCancelResult {
  /** Suite identifier. */
  readonly suiteId: string;
  /** Suite status after cancellation. */
  readonly status: SuiteStatus;
  /** Whether cancellation was applied (false when already finished). */
  readonly cancelled: boolean;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Options for report generation. */
export interface ReportOptions {
  /** Output format (default: "markdown"). */
  readonly format?: "markdown" | "json" | "html";
  /** Sections to include (default: all). */
  readonly sections?: readonly ReportSection[];
}

/** Report sections that can be selectively included. */
export type ReportSection =
  | "environment"
  | "indexing"
  | "tasks"
  | "tokens"
  | "accuracy"
  | "context"
  | "summary"
  | "failures";

/** Generated benchmark report. */
export interface BenchmarkReport {
  /** Suite identifier. */
  readonly suiteId: string;
  /** Report content (Markdown, JSON, or HTML text). */
  readonly content: string;
  /** Report format. */
  readonly format: "markdown" | "json" | "html";
  /** ISO timestamp of generation. */
  readonly generatedAt: string;
}

// ---------------------------------------------------------------------------
// Runner interface (internal, not part of the port but used by the service)
// ---------------------------------------------------------------------------

/** Interface for a benchmark runner (opencode or ollama). */
export interface BenchmarkRunner {
  /** Runner identifier. */
  readonly name: BenchmarkAgent;
  /** Execute a single task and return raw metrics. */
  execute(request: RunnerRequest): Promise<Result<RunnerResult>>;
}

/** Request passed to a runner. */
export interface RunnerRequest {
  readonly prompt: string;
  readonly repositoryPath: string;
  readonly mode: BenchmarkMode;
  readonly timeoutMs: number;
  /** Tool definitions for CodeAtlas mode (ollama runner only). */
  readonly tools?: readonly ToolDefinition[];
  /** Model to use (overrides runner default). */
  readonly model?: string | undefined;
  /** Signal for cooperative cancellation. Runners should check and abort when fired. */
  readonly signal?: AbortSignal | undefined;
}

/** Raw result from a runner. */
export interface RunnerResult {
  readonly metrics: TokenMetrics;
  readonly cost: number;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly exitCode: number | null;
  readonly finalText: string;
  readonly toolCalls: readonly ToolCallRecord[];
  /** Additive Phase A observability / attribution ledger. */
  readonly observability?: BenchmarkObservability | undefined;
  /** Why the tool loop terminated. */
  readonly stopReason?: string | undefined;
  /** Number of tool-loop rounds executed. */
  readonly roundCount?: number | undefined;
  /** Number of search queries served from dedup cache. */
  readonly dedupeHitCount?: number | undefined;
  readonly error?: string | undefined;
  readonly stderr?: string | undefined;
}
