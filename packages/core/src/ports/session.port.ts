import type { Brand, Result } from "@atlas/shared";
import type { ProviderMessage, TokenUsage } from "./provider.port";

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
  /** Model identifier that last answered the prompt (when provider is a chat agent). */
  readonly model: string | undefined;
  /** Exact token usage reported by the provider, when available. */
  readonly tokenUsage: TokenUsage | undefined;
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
  /**
   * Full conversation history for multi-turn/tool-loop requests. When present,
   * this is forwarded to chat agents as the message list instead of a single
   * user prompt.
   */
  readonly messages?: readonly ProviderMessage[];
}

/** The captured stdout/stderr of a session launched with `captureOutput`. */
export interface SessionOutput {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * A provider-backed chat agent session — does not spawn an external process
 * but instead makes a single provider call (via ProviderPort) and returns the
 * model's answer.
 *
 * Used when `provider` is not one of the built-in CLI adapters (e.g. `"ollama"`).
 * The session lifecycle is managed by the same `SessionPort` machinery; the
 * runner returns its result as the captured output so callers can render it.
 */
export interface ChatAgentPort {
  /** Provider ids this runner can execute, e.g. `["ollama"]`. */
  readonly providers: readonly string[];
  /** Whether the given provider is handled by this runner. */
  handles(provider: string): boolean;
  /** Run one non-interactive chat turn for the given provider.
   *
   * The prompt is sent to the provider (via its `complete`/`chatCompletion` path)
   * and the model's reply content is captured as `stdout` in the result.
   */
  run(request: ChatAgentRequest): Promise<Result<ChatAgentResult>>;
}

/** Arguments for one chat-agent run. */
export interface ChatAgentRequest {
  /** Provider id, e.g. `"ollama"`. Must be listed in the runner's `providers`. */
  readonly provider: string;
  /** Prompt / task text forwarded to the model. */
  readonly prompt: string;
  /** Optional repository path context; supplied by the session manager. */
  readonly repositoryPath: string;
  /**
   * Full conversation history for multi-turn/tool-loop requests. When present,
   * the agent sends this as the message list instead of a single user prompt.
   */
  readonly messages?: readonly ProviderMessage[];
}

/** Result of one chat-agent run. */
export interface ChatAgentResult {
  /** Model identifier that answered the prompt. */
  readonly model: string | undefined;
  /** The model's reply content. */
  readonly content: string;
  /** Wall-clock duration of the turn, in milliseconds. */
  readonly durationMs: number;
  /** Exact token usage reported by the provider, when available. */
  readonly tokenUsage: TokenUsage | undefined;
  /**
   * Full conversation history after the run (including all tool calls and
   * results). Callers can pass this as `messages` in the next request for
   * multi-turn continuity.
   */
  readonly messages?: readonly ProviderMessage[];
  /**
   * Tool call ids that were denied by the runner's tool-call policy (advisory
   * security surface). Denials are returned to the model as error results and
   * the run continues. Undefined/empty when no policy denied anything.
   */
  readonly deniedToolCalls?: readonly string[];
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
