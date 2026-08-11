/**
 * The Multi-Agent Orchestrator contract (Task 17).
 *
 * Coordinates **explicit, bounded** AI agents on a user task — assigning roles,
 * running them in parallel or sequentially, collecting their results, and
 * combining them. It is *not* an uncontrolled autonomous swarm:
 *
 * - The orchestrator decides **what** each agent runs and **when**; agents never
 *   spawn other agents and never talk to each other directly.
 * - Every process/session concern goes through `SessionPort`; every provider
 *   concern through the `@atlas/agents` adapters.
 * - A plan is a **fixed role list** with a hard cap on participating agents.
 */

/** How the roles of a plan are executed. */
export type ExecutionMode = "parallel" | "sequential";

/**
 * Context visibility for one role:
 * - `"shared"` (normal) — the role receives the full project context package
 *   assembled for its sub-task.
 * - `"isolated"` — the role receives only context items under `paths` (e.g. a
 *   security review scoped to the authentication module). Secrets are still
 *   deny-filtered; `paths` only narrows what is *relevant*.
 */
export type ContextScope =
  | { readonly type: "shared" }
  | { readonly type: "isolated"; readonly paths: readonly string[] };

/** One participating agent in a plan: an explicit, bounded role. */
export interface RoleDefinition {
  /** Stable role id, unique within a plan (e.g. `"security"`). */
  readonly id: string;
  /** Human-readable role name (e.g. `"Review security"`). */
  readonly name: string;
  /** Provider/adapter id that runs the role (e.g. `"claude"`). */
  readonly provider: string;
  /** The sub-task delegated to this role. */
  readonly task: string;
  /** Whether this role sees shared or path-isolated context. */
  readonly contextScope: ContextScope;
  /**
   * Kill the role's session after this many ms and report the partial output
   * honestly. `undefined` falls back to the orchestrator's default timeout.
   */
  readonly timeoutMs?: number;
  /**
   * Bounded retries for **retryable launch failures only** (CLI missing, spawn
   * error). Runtime failures and non-deterministic outcomes are never retried.
   * `undefined` falls back to the orchestrator's default.
   */
  readonly maxRetries?: number;
}

/** A bounded, explicit execution plan — no dynamic agent spawning. */
export interface TaskPlan {
  /** Unique, stable plan id. */
  readonly id: string;
  /** The original user task. */
  readonly task: string;
  /** Absolute repository the roles run in (each session is launched here). */
  readonly repositoryPath: string;
  /** `"parallel"` or `"sequential"`. */
  readonly mode: ExecutionMode;
  /** The explicit role list. */
  readonly roles: readonly RoleDefinition[];
}

/** Lifecycle of one role within a run. */
export type RoleStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "stopped"
  | "timed-out"
  | "cancelled";

/** The collected outcome of one role (its session, status, and output). */
export interface RoleResult {
  /** The role this outcome belongs to. */
  readonly role: RoleDefinition;
  /** The session that ran the role (absent when it never launched). */
  readonly sessionId: string | undefined;
  readonly status: RoleStatus;
  /** Child exit code; `null` when killed by a signal; `undefined` before exit. */
  readonly exitCode: number | null | undefined;
  /** Safe, human-readable failure detail — never keys, env, or stack traces. */
  readonly error: string | undefined;
  /** Captured stdout (empty when the role did not capture output). */
  readonly stdout: string;
  /** Captured stderr (empty when the role did not capture output). */
  readonly stderr: string;
  /** True when the role was killed by a timeout. */
  readonly timedOut: boolean;
  /** How many retryable launch attempts were consumed before the final one. */
  readonly retries: number;
  readonly startedAt: number | undefined;
  readonly endedAt: number | undefined;
}

/** Lifecycle of an orchestration run. */
export type RunStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

/** A run's plan plus the collected per-role results. */
export interface OrchestrationRun {
  readonly plan: TaskPlan;
  readonly status: RunStatus;
  readonly results: readonly RoleResult[];
}

/**
 * The provider-agnostic Multi-Agent Orchestrator. It drives `SessionPort` (never
 * spawning directly) and delegates context assembly to the Context → Agent
 * integration layer. A single role failure never silently corrupts another: each
 * role result is classified and reported independently, and the run exposes the
 * combined status of every participant.
 */
export interface OrchestratorPort {
  /**
   * Execute a plan and collect every role's result. Cancellation and role
   * failures stop the remaining roles (never leaving orphan children).
   */
  orchestrate(plan: TaskPlan): Promise<OrchestrationRun>;
  /**
   * Cancel an in-flight run (its remaining/active role sessions are stopped).
   * When `runId` is omitted, the most recent run is cancelled.
   */
  cancel(runId?: string): Promise<void>;
  /**
   * The latest snapshot of a run, or `undefined` when unknown. When `runId` is
   * omitted, the most recent run is returned.
   */
  getRun(runId?: string): OrchestrationRun | undefined;
}
