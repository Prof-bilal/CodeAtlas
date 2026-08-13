import type { Brand, Result } from "@atlas/shared";

/**
 * A typed identifier for an agent inside a session. Today the session manager
 * derives it from the provider id; the future orchestrator (Tasks 16/17) will
 * give agents richer, distinct identities.
 */
export type AgentId = Brand<string, "AgentId">;

/** Lifecycle state of one agent session (single status system for sessions). */
export type SessionStatus = "CREATED" | "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "FAILED";

/** A single agent session: one supervised external AI CLI process. */
export interface Session {
  /** Unique, stable session id (never the OS process id). */
  readonly id: string;
  /** Identifier of the agent that owns this session. */
  readonly agentId: AgentId;
  /** Adapter/provider id that launched the process, e.g. `"claude"`. */
  readonly provider: string;
  /** Absolute repository path the session was launched in. */
  readonly repositoryPath: string;
  /** Current lifecycle state. */
  readonly status: SessionStatus;
  /** OS process id of the live child, once started. */
  readonly processId: number | undefined;
  /** Epoch ms when the process was launched. */
  readonly startedAt: number | undefined;
  /** Epoch ms when the session reached a terminal state. */
  readonly endedAt: number | undefined;
  /** Child exit code; `null` when killed by a signal; `undefined` before exit. */
  readonly exitCode: number | null | undefined;
  /** Safe, human-readable failure detail — never secrets, keys, or env. */
  readonly error: string | undefined;
}

/** What {@link SessionPort.createSession} needs. */
export interface SessionCreateRequest {
  /** Adapter id, e.g. `"claude"`. Validated against registered adapters. */
  readonly provider: string;
  /** Repository path the session will run in (validated to be a directory). */
  readonly repositoryPath: string;
}

/** Optional launch details for {@link SessionPort.startSession}. */
export interface SessionLaunchRequest {
  /**
   * Task text forwarded to the CLI as its argument. Prompt/context selection is
   * deliberately **not** performed here — that is Task 16. Without a prompt the
   * CLI is launched in its configured (non-interactive) mode.
   */
  readonly prompt?: string;
  /** Extra provider-specific CLI args appended after any run-mode flags. */
  readonly args?: readonly string[];
  /** Extra environment entries for the child; never logged, never echoed. */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * Pipe and buffer the child's stdout/stderr so callers can read the agent's
   * output afterwards (via {@link SessionPort.getSessionOutput}). When omitted
   * the child runs with `stdio: "ignore"` (sessions do not capture output by
   * default). Captured output is bounded and is never echoed to logs.
   */
  readonly captureOutput?: boolean;
  /**
   * Launch the CLI **interactively** as a real terminal handoff: the child
   * inherits the parent's stdin/stdout/stderr (`stdio: "inherit"`) and runs
   * **without** the adapter's non-interactive run-mode flags (e.g. no
   * `claude -p`), so the user talks to the agent CLI directly. Callers must
   * pause their own stdin handling while the session runs and observe the
   * session's terminal state to know when control returns. Mutually exclusive
   * with `captureOutput` — interactive wins (output cannot be captured while it
   * is inherited).
   */
  readonly interactive?: boolean;
}

/** The captured stdout/stderr of a session launched with `captureOutput`. */
export interface SessionOutput {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The provider-agnostic Agent Session Manager contract.
 *
 * Owns the *session* lifecycle (create → start → stop/terminate), tracking, and
 * cleanup. Process execution is delegated to the process layer; this interface
 * knows nothing about a specific AI CLI. Multiple sessions run independently —
 * one session's failure never affects another's.
 */
export interface SessionPort {
  /** Create a session in `CREATED` state (validates provider + repository). */
  createSession(request: SessionCreateRequest): Result<Session>;
  /** Launch the session's process: `CREATED → STARTING → RUNNING` (or `FAILED`). */
  startSession(sessionId: string, launch?: SessionLaunchRequest): Promise<Result<Session>>;
  /** The current session snapshot, or `undefined` when the id is unknown. */
  getSession(sessionId: string): Session | undefined;
  /** Every session, from oldest to newest. */
  listSessions(): readonly Session[];
  /** Sessions in a non-terminal state (`STARTING`/`RUNNING`/`STOPPING`). */
  getActiveSessions(): readonly Session[];
  /**
   * The captured stdout/stderr of a session launched with `captureOutput: true`,
   * or `undefined` when the session is unknown or did not capture output. The
   * output stays available after the session reaches a terminal state.
   */
  getSessionOutput(sessionId: string): SessionOutput | undefined;
  /** Graceful stop: `RUNNING → STOPPING → STOPPED` (SIGTERM, escalate to SIGKILL). */
  stopSession(sessionId: string): Promise<Result<Session>>;
  /** Force stop: immediate SIGKILL → `STOPPED`. */
  terminateSession(sessionId: string): Promise<Result<Session>>;
  /** Stop every active session (CodeAtlas shutdown / orphan protection). */
  shutdown(): Promise<void>;
}
