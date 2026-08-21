import {
  type AgentAdapter,
  type ChatAgentPort,
  type ExecutableResolver,
  type ProcessRunner,
  ProviderChatAgent,
  SessionManager,
} from "@atlas/agents";
import type { SessionPort } from "@atlas/core";
import { createProviderService } from "../providers/service";

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
  /** Chat agents for providers that are not built-in CLI adapters. */
  readonly chatAgents?: readonly ChatAgentPort[];
}

/**
 * Create the Agent Session Manager (backed by `@atlas/agents`).
 *
 * The returned `SessionPort` is the provider-agnostic way to create, start,
 * track, inspect, stop, and terminate external AI CLI sessions. Providers are
 * resolved through the existing adapter/connection layer — no provider-specific
 * logic lives here.
 *
 * When `chatAgents` is not provided, a default `ProviderChatAgent` wrapping
 * `createProviderService()` is used, so the selected Ollama model (read from
 * persisted config) is automatically honored.
 */
export function createSessionManager(options: CreateSessionManagerOptions = {}): SessionPort {
  const defaultChatAgent = new ProviderChatAgent(createProviderService(), ["ollama"]);
  const chatAgents = options.chatAgents ?? [defaultChatAgent];
  return new SessionManager({
    ...options,
    chatAgents,
  });
}
