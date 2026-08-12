import type { CompatibilityPort, InstallerPort, SecurityPort } from "@atlas/core";
import {
  type EcosystemAdapter,
  type InstallerProcess,
  InstallerService,
  SecurityAssessor,
} from "@atlas/toolkit";
import { type CreateCompatibilityEngineOptions, createCompatibilityEngine } from "./compatibility";

/** Options for {@link createInstaller}. */
export interface CreateInstallerOptions extends CreateCompatibilityEngineOptions {
  /** The Compatibility Engine to gate against; defaults to a real one. */
  readonly compatibility?: CompatibilityPort;
  readonly security?: SecurityPort;
  /**
   * Ecosystem install adapters; defaults to the MVP safe subset (`npm`, `pip`,
   * `cargo`, `go`). Provide a custom set to add an ecosystem as a new adapter.
   * (Named `ecosystemAdapters` to avoid colliding with the AI-CLI `adapters`
   * the Compatibility Engine takes.)
   */
  readonly ecosystemAdapters?: readonly EcosystemAdapter[];
  /** Binary resolver used by post-install verification (default: PATH scan). */
  readonly resolveBinary?: (binary: string) => string | null;
  /** Version reader used by post-install verification (default: `--version`). */
  readonly readVersion?: (binary: string, args: readonly string[]) => string | null;
  /** Args the version reader runs; defaults to `["--version"]`. */
  readonly versionArgs?: readonly string[];
  /** Process boundary; inject a fake for offline tests. */
  readonly process?: InstallerProcess;
  /** Injectable clock for deterministic timestamps and tests. */
  readonly now?: () => Date;
}

/**
 * Create the Tool Installer (Task 22) — safely installs tools through official
 * distribution channels only, with explicit user approval, compatibility +
 * security gating, post-install verification, best-effort rollback, and Tool
 * Manifest provenance recording. Composes the default Compatibility Engine
 * (which routes AI-CLI detection through `AgentPort`) unless one is injected.
 */
export function createInstaller(options: CreateInstallerOptions = {}): InstallerPort {
  const compatibility: CompatibilityPort =
    options.compatibility ?? createCompatibilityEngine(options);
  const service = new InstallerService({
    compatibility,
    security: options.security ?? new SecurityAssessor(options.now),
    ...(options.ecosystemAdapters !== undefined ? { adapters: options.ecosystemAdapters } : {}),
    ...(options.resolveBinary !== undefined ? { resolveBinary: options.resolveBinary } : {}),
    ...(options.readVersion !== undefined ? { readVersion: options.readVersion } : {}),
    ...(options.versionArgs !== undefined ? { versionArgs: options.versionArgs } : {}),
    ...(options.process !== undefined ? { process: options.process } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  return service;
}
