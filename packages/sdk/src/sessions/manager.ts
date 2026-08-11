import type { SessionPort } from "@atlas/core";
import {
  SessionManager,
  type AgentAdapter,
  type ExecutableResolver,
  type ProcessRunner,
} from "@atlas/agents";

/** Options for {@link createSessionManager}. */
export interface CreateSessionManagerOptions {
  /** Provider adapters; defaults to the four built-ins. */
  readonly adapters?: readonly AgentAdapter[];
  /** Binary resolver; defaults to PATH scanning. */
  readonly resolveExecutable?: ExecutableResolver;
  /** Process supervisor; inject a fake for offline tests. */
  readonly processRunner?: ProcessRunner;
  /** Provider used when a request omits one (connection layer default). */
  readonly defaultProvider?: string;
  /** Retained-terminal-session cap before pruning (memory guard). */
  readonly maxRetainedSessions?: number;
}

/**
 * Create the Agent Session Manager (backed by `@atlas/agents`).
 *
 * The returned `SessionPort` is the provider-agnostic way to create, start,
 * track, inspect, stop, and terminate external AI CLI sessions. Providers are
 * resolved through the existing adapter/connection layer — no provider-specific
 * logic lives here.
 */
export function createSessionManager(options: CreateSessionManagerOptions = {}): SessionPort {
  return new SessionManager(options);
}
