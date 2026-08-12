import type { Result } from "@atlas/shared";
import type { ToolInstallMethodType } from "./tool-registry.port";

/**
 * The Agent Toolkit — Compatibility Engine contract (Direction C, Task 21).
 *
 * Determines whether a tool **can safely operate in the user's environment**
 * before any install or configuration step. The engine compares a tool's
 * *declared* compatibility requirements (from a Tool Manifest) against the
 * *detected* environment — OS, architecture, runtimes, package managers,
 * AI CLIs, MCP, and required permissions.
 *
 * Trust rules the port enforces:
 * - It **never installs anything** and **never fails open**: an
 *   `incompatible` tool is reported as not installable here.
 * - AI-CLI availability/version is detected through the existing `AgentPort`
 *   — executable detection is never reimplemented here.
 * - `unknown` means "cannot determine" and is **flagged, never guessed**.
 */
export interface CompatibilityPort {
  /** Evaluate declared requirements against the detected environment. */
  evaluate(input: CompatibilityEvaluationInput): Promise<Result<CompatibilityReport>>;
}

/** Exactly one state per check and per overall report. */
export type CompatibilityState = "compatible" | "partially-compatible" | "incompatible" | "unknown";

/** A runtime the tool declares it needs (structural twin of the manifest's
 *  `ToolManifestRuntime`). */
export interface CompatibilityRuntime {
  readonly name: string;
  /** Semver range (e.g. `">=20.19.0"`), or `null` when any version works. */
  readonly versionRange: string | null;
}

/** Declared compatibility requirements of one tool. */
export interface CompatibilityRequirements {
  /** OS identifiers the tool runs on (`"win32"`, `"linux"`, `"darwin"`, …). */
  readonly os: readonly string[];
  /** Runtime requirements (Node, Python, Go, …). */
  readonly runtimes: readonly CompatibilityRuntime[];
  /** AI agent CLIs the tool integrates with. */
  readonly agents: readonly string[];
  /** Whether the tool requires the MCP runtime. */
  readonly mcp: boolean;
  /** CPU architectures supported (`"x64"`, `"arm64"`, …). */
  readonly architecture: readonly string[];
  /** Permissions the tool needs (network, filesystem, processes, …). */
  readonly permissions: readonly string[];
}

/** One verdictable line of the compatibility report. */
export interface CompatibilityCheck {
  /** Stable id, e.g. `"os"`, `"runtime:node"`, `"agent:claude"`. */
  readonly id: string;
  /** Short human label used in rendering, e.g. `"Node >=20.19.0"`. */
  readonly label: string;
  /** Exactly one of the four result states. */
  readonly state: CompatibilityState;
  /** Human-readable evidence, or `null`. */
  readonly detail: string | null;
  /**
   * True for checks that are reported but never downgrade the overall verdict
   * (e.g. declared permissions — availability is enforced by the installer's
   * consent flow, not pre-verified here).
   */
  readonly advisory: boolean;
  /** Per-item sub-checks for a group check (e.g. one per declared agent). */
  readonly subChecks?: readonly CompatibilityCheck[];
}

/** The full result of evaluating one tool against the environment. */
export interface CompatibilityReport {
  readonly toolName: string;
  /** Installed/declared tool version, or `null`. */
  readonly toolVersion: string | null;
  /** Exactly one overall state across all non-advisory checks. */
  readonly overall: CompatibilityState;
  readonly checks: readonly CompatibilityCheck[];
  /** `true` when the tool cannot operate here — the installer must not
   *  proceed. Never falsifiable by a missing determination (fail-safe). */
  readonly notInstallable: boolean;
}

/** The input to {@link CompatibilityPort.evaluate}. */
export interface CompatibilityEvaluationInput {
  readonly toolName: string;
  readonly toolVersion: string | null;
  readonly requirements: CompatibilityRequirements;
  /** Declared distribution mechanism, used to check the matching package
   *  manager; `null` when an install method is not declared at this stage. */
  readonly installMethod: ToolInstallMethodType | null;
}
