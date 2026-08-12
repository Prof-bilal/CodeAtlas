import {
  type AgentAdapter,
  AgentService,
  type ExecutableResolver,
  type ProcessRunner,
} from "@atlas/agents";
import type { AgentPort, CompatibilityPort } from "@atlas/core";
import {
  CompatibilityEngineService,
  EnvironmentDetector,
  type EnvironmentDetectorOptions,
} from "@atlas/toolkit";

/** Options for {@link createCompatibilityEngine}. */
export interface CreateCompatibilityEngineOptions {
  /**
   * AI-CLI detection source; defaults to a real `AgentService`. Inject a fake
   * in tests so no binary is ever probed.
   */
  readonly agents?: AgentPort;
  /** Forwarded to the default `AgentService`. */
  readonly adapters?: readonly AgentAdapter[];
  readonly resolveExecutable?: ExecutableResolver;
  readonly processRunner?: ProcessRunner;
  readonly defaultProvider?: string;
  /** Detected environment; inject one in tests. */
  readonly environment?: EnvironmentDetector;
  /** Forwarded to the default {@link EnvironmentDetector}. */
  readonly platform?: string;
  readonly arch?: string;
  readonly nodeVersion?: string;
  readonly findExecutable?: EnvironmentDetectorOptions["findExecutable"];
  readonly readVersion?: EnvironmentDetectorOptions["readVersion"];
}

/**
 * Create the Compatibility Engine (Task 21) — determines whether a tool can
 * safely operate in the user's environment before any install or configuration
 * step. Compares a tool's declared requirements (a Tool Manifest's
 * `compatibility` object) against the detected OS/architecture/runtimes/
 * package managers / AI CLIs / MCP. It never installs anything, and an
 * `incompatible` tool is surfaced as not installable here.
 */
export function createCompatibilityEngine(
  options: CreateCompatibilityEngineOptions = {},
): CompatibilityPort {
  const agents: AgentPort =
    options.agents ??
    new AgentService({
      ...(options.adapters !== undefined ? { adapters: options.adapters } : {}),
      ...(options.resolveExecutable !== undefined
        ? { resolveExecutable: options.resolveExecutable }
        : {}),
      ...(options.processRunner !== undefined ? { processRunner: options.processRunner } : {}),
      ...(options.defaultProvider !== undefined
        ? { defaultProvider: options.defaultProvider }
        : {}),
    });
  const environment =
    options.environment ??
    new EnvironmentDetector({
      ...(options.platform !== undefined ? { platform: options.platform } : {}),
      ...(options.arch !== undefined ? { arch: options.arch } : {}),
      ...(options.nodeVersion !== undefined ? { nodeVersion: options.nodeVersion } : {}),
      ...(options.findExecutable !== undefined ? { findExecutable: options.findExecutable } : {}),
      ...(options.readVersion !== undefined ? { readVersion: options.readVersion } : {}),
    });
  return new CompatibilityEngineService({ agentPort: agents, environment });
}
