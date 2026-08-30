import type { VerificationStrategy } from "./planner.port";

/**
 * A single claim check result (Phase 4, P4.2).
 *
 * Claim checks are deterministic, fast, and catch the majority of
 * hallucinations without spawning any processes.
 */
export interface ClaimCheck {
  /** Stable claim id for programmatic handling. */
  readonly id: string;
  /** The type of claim being checked. */
  readonly kind: ClaimKind;
  /** What was checked (e.g. file path, symbol name, plan step). */
  readonly target: string;
  /** Whether the claim passed. */
  readonly passed: boolean;
  /** Human-readable explanation of the result. */
  readonly detail: string;
}

/** The type of a claim check. */
export type ClaimKind = "path-exists" | "symbol-exists" | "plan-coverage" | "output-contract";

/**
 * Input for running claim checks against an answer.
 */
export interface ClaimCheckInput {
  /** The task the model was asked to answer. */
  readonly task: string;
  /** File paths cited in the model's answer. */
  readonly citedPaths: readonly string[];
  /** Symbol names cited in the model's answer. */
  readonly citedSymbols: readonly string[];
  /** Plan step targets the answer should cover. */
  readonly planTargets: readonly string[];
  /** Output contract assertions (e.g. "must contain a function named X"). */
  readonly outputContract?: readonly OutputContractAssertion[];
}

/** An assertion about the output shape. */
export interface OutputContractAssertion {
  /** What to check (e.g. "contains-function", "no-errors"). */
  readonly kind: string;
  /** The value to check against. */
  readonly value: string;
}

/**
 * The result of running all claim checks.
 */
export interface ClaimCheckResult {
  /** All claim checks that were run. */
  readonly checks: readonly ClaimCheck[];
  /** How many checks passed. */
  readonly passed: number;
  /** How many checks failed. */
  readonly failed: number;
  /** True when all checks passed. */
  readonly allPassed: boolean;
}

/**
 * A single command runner result (Phase 4, P4.3).
 */
export interface CommandRunResult {
  /** The command that was run. */
  readonly command: string;
  /** The arguments passed. */
  readonly args: readonly string[];
  /** Exit code (0 = success). */
  readonly exitCode: number;
  /** Captured stdout (may be truncated). */
  readonly stdout: string;
  /** Captured stderr (may be truncated). */
  readonly stderr: string;
  /** Whether the command timed out. */
  readonly timedOut: boolean;
  /** Wall-clock duration in milliseconds. */
  readonly durationMs: number;
  /** Whether this was a pre-existing failure (from baseline diff). */
  readonly preExisting: boolean;
}

/**
 * A complete verification report (Phase 4, P4.5).
 */
export interface VerificationReport {
  /** The task that was verified. */
  readonly task: string;
  /** The verification strategy used. */
  readonly strategy: VerificationStrategy;
  /** Claim check results. */
  readonly claims: ClaimCheckResult;
  /** Command run results (empty when strategy is "claim-checks" or "none"). */
  readonly commands: readonly CommandRunResult[];
  /** Overall verification verdict. */
  readonly verdict: VerificationVerdict;
  /** Human-readable summary. */
  readonly summary: string;
  /** When the verification was run. */
  readonly timestamp: string;
}

/** The overall verification verdict. */
export type VerificationVerdict = "pass" | "fail" | "partial" | "skipped" | "error";

/**
 * Configuration for verification commands (from `.codeatlas/verify.json`).
 */
export interface VerifyConfig {
  /** Whether verification is enabled. */
  readonly enabled: boolean;
  /** Command definitions keyed by category (typecheck, tests, lint). */
  readonly commands: Readonly<Record<string, VerifyCommandConfig>>;
}

/** Configuration for a single verification command. */
export interface VerifyCommandConfig {
  /** The executable to run (resolved via PATH). */
  readonly command: string;
  /** Arguments to pass (argv-array, never shell string). */
  readonly args: readonly string[];
  /** Per-invocation timeout in milliseconds (default 60000). */
  readonly timeoutMs?: number;
}

/**
 * Verifier port (Phase 4, ADR-018).
 *
 * Runs claim checks and command runners to verify the model's answer.
 * Claim checks are deterministic and fast; command runners spawn processes
 * behind an allow-list with timeout and output capture.
 */
export interface VerifierPort {
  /**
   * Run claim checks against an answer.
   *
   * Deterministic, no IO, no spawning. Catches path/symbol hallucinations
   * and plan coverage gaps.
   */
  checkClaims(input: ClaimCheckInput): Promise<ClaimCheckResult>;

  /**
   * Run verification commands (typecheck, tests, lint).
   *
   * Spawns processes behind the allow-list with timeout and output capture.
   * Only runs commands defined in `.codeatlas/verify.json`.
   */
  runCommands(config: VerifyConfig, cwd: string): Promise<readonly CommandRunResult[]>;

  /**
   * Run a full verification: claim checks + commands + baseline diff.
   *
   * Returns a complete verification report.
   */
  verify(
    input: ClaimCheckInput,
    config: VerifyConfig | undefined,
    cwd: string,
    baselinePath?: string,
  ): Promise<VerificationReport>;
}
