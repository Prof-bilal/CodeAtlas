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
  /** Close underlying resources. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Supported AI agent backends for task execution. */
export type BenchmarkAgent = "opencode" | "ollama";

/** Comparison mode: baseline (no MCP) vs CodeAtlas (with MCP context). */
export type BenchmarkMode = "baseline" | "codeatlas";

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
  /** Modes to run (both by default). */
  readonly modes: readonly BenchmarkMode[];
  /** Agent-specific options. */
  readonly agentOptions?: AgentOptions;
  /** Per-task timeout in milliseconds (default: 540_000 = 9 minutes). */
  readonly taskTimeoutMs?: number;
  /** Number of runs per task per mode (default: 1). */
  readonly runsPerTask?: number;
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
export type SuiteStatus = "created" | "running" | "completed" | "failed";

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
  /** Whether the call produced an error. */
  readonly isError: boolean;
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

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Options for report generation. */
export interface ReportOptions {
  /** Output format (default: "markdown"). */
  readonly format?: "markdown" | "json";
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
  /** Report content (Markdown text or JSON string). */
  readonly content: string;
  /** Report format. */
  readonly format: "markdown" | "json";
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
  readonly error?: string | undefined;
  readonly stderr?: string | undefined;
}
