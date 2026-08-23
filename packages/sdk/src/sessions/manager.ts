import {
  type AgentAdapter,
  type ChatAgentPort,
  type ExecutableResolver,
  type ProcessRunner,
  ProviderChatAgent,
  SessionManager,
} from "@atlas/agents";
import type { SessionPort } from "@atlas/core";
import { type ContextToolSource, ToolUsingChatAgent } from "../context-tools";
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
  /**
   * Context tool source for the Ollama tool loop. When provided, the default
   * chat agent for `"ollama"` is replaced with a `ToolUsingChatAgent` that
   * can execute context tools (search, read, dependencies, etc.) via the
   * MCP handler bridge. When absent, the simple single-turn `ProviderChatAgent`
   * is used.
   */
  readonly contextToolSource?: ContextToolSource;
}

/**
 * Create the Agent Session Manager (backed by `@atlas/agents`).
 *
 * The returned `SessionPort` is the provider-agnostic way to create, start,
 * track, inspect, stop, and terminate external AI CLI sessions. Providers are
 * resolved through the existing adapter/connection layer — no provider-specific
 * logic lives here.
 *
 * When `contextToolSource` is provided, the default chat agent for Ollama is
 * replaced with a `ToolUsingChatAgent` that supports the tool loop (the model
 * can request repository context mid-turn). When absent, a simple single-turn
 * `ProviderChatAgent` is used.
 */
export function createSessionManager(options: CreateSessionManagerOptions = {}): SessionPort {
  const providerService = createProviderService();

  let chatAgents: readonly ChatAgentPort[];
  if (options.chatAgents !== undefined) {
    chatAgents = options.chatAgents;
  } else if (options.contextToolSource !== undefined) {
    // Wire the tool loop agent for Ollama
    chatAgents = [new ToolUsingChatAgent(providerService, options.contextToolSource, ["ollama"])];
  } else {
    // Default: single-turn chat agent (no tool loop)
    chatAgents = [new ProviderChatAgent(providerService, ["ollama"])];
  }

  return new SessionManager({
    ...options,
    chatAgents,
  });
}
