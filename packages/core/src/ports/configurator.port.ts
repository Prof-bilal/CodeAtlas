import type { Result } from "@atlas/shared";

/**
 * The Agent Toolkit — Tool Configurator contract (Direction C, Task 23).
 *
 * After a tool is installed (Task 22), the Configurator wires it into the
 * agents/environment that can use it. Configuration targets are Claude,
 * Gemini, Codex, OpenCode, MCP, and VS Code — provider-specific logic stays
 * **inside one adapter per target**, exactly like `@atlas/providers` and
 * `@atlas/agents`. There is **no giant `if (target === …)` configuration
 * function.**
 *
 * Flow per applicable target: detect → generate → validate → apply → verify.
 *
 * Safety rules the port enforces (see `docs/AGENT_TOOLKIT.md` §9 and
 * `docs/SECURITY.md`):
 * - Configuration is written to **user config only** — never silently into the
 *   analyzed repository (repo files are untrusted input).
 * - Existing configuration is **backed up** before any overwrite.
 * - Existing config is **merged, never clobbered**: unrelated keys are
 *   preserved verbatim; a config file the adapter cannot parse as a JSON
 *   object is reported as blocked and **refused** rather than overwritten.
 * - Applied configuration can be **rolled back** (best-effort restore).
 * - `configure({ dryRun: true })` renders the exact changes without writing
 *   anything.
 * - Only **installed, supported** targets are configured: agent targets route
 *   detection through `AgentPort` (`@atlas/agents`) — executable detection is
 *   never reimplemented here.
 */
export interface ConfiguratorPort {
  /** The targets this build can actually configure (all six adapters). */
  readonly implementedTargets: readonly ConfigurationTarget[];

  /**
   * Detect the applicable targets for a tool and render the exact configured
   * documents. Read-only: nothing is written and nothing is modified.
   */
  plan(request: ConfiguratorRequest): Promise<Result<ConfigurationPlan>>;

  /**
   * Apply configuration for the applicable, installed, supported targets.
   * With `options.dryRun === true` it produces the same plan data without
   * touching the file system. Each target is applied independently and its
   * result reported honestly (`applied` / `verified` / `skipped` /
   * `failed` target lists).
   */
  configure(
    request: ConfiguratorRequest,
    options?: { readonly dryRun?: boolean },
  ): Promise<Result<ConfigureOutcome>>;
}

/** The configuration targets the Toolkit can wire a tool into. */
export type ConfigurationTarget =
  | "claude"
  | "gemini"
  | "codex"
  | "opencode"
  | "cursor"
  | "cline"
  | "mcp"
  | "vscode";

/**
 * The input to the Configurator — everything needed to detect, generate,
 * validate, apply, and verify configuration for one installed tool.
 */
export interface ConfiguratorRequest {
  /** Tool id (must be a safe, non-path name). */
  readonly toolName: string;
  /** Installed tool version, recorded in the generated entries when present. */
  readonly toolVersion?: string | null;
  /** AI agents the tool declares support for (`claude`, `gemini`, `codex`,
   *  `opencode` — e.g. the Tool Manifest's / registry record's
   *  `supportedAgents`). */
  readonly supportedAgents?: readonly string[];
  /** Tool declares MCP support (e.g. manifest `compatibility.mcp` or an `mcp`
   *  install method) — makes the MCP target applicable and registers the tool
   *  under each agent's MCP section. */
  readonly mcp?: boolean;
  /** Tool declares VS Code support — makes the VS Code target applicable. */
  readonly vscode?: boolean;
  /** User-config root; defaults to the Configurator's `configHome` (the OS
   *  home directory). Every target path is derived from here — never from the
   *  analyzed repository. */
  readonly configHome?: string;
  /** Restrict which targets to consider; defaults to all implemented. */
  readonly targets?: readonly ConfigurationTarget[];
}

/** Applicability verdict for one target (installed + supported). */
export interface ConfigurationTargetCheck {
  readonly target: ConfigurationTarget;
  /** Human label, e.g. `"Claude Code"`. */
  readonly label: string;
  /** The tool declares support for this target. */
  readonly supported: boolean;
  /** The target's agent CLI (or host) is installed/detectable. */
  readonly available: boolean;
  /** `supported && available` — should configuration proceed for it? */
  readonly applicable: boolean;
  /** Human-readable evidence, or `null`. */
  readonly detail: string | null;
}

/** The verification verdict after an apply (a read-back check). */
export interface ConfigurationVerification {
  /** True when the written config was re-read and contains the tool entry. */
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * The exact configuration change for **one target**: the merged document that
 * would be (or was) written, what is preserved vs added, and its lifecycle
 * state (backup + verification). When `problems` is non-empty the existing
 * config could not be merged safely — `mergedDocument` is `null` and nothing
 * will be written (`never clobber`).
 */
export interface ConfigurationChange {
  readonly target: ConfigurationTarget;
  readonly label: string;
  /** Absolute user-config file that would be written. */
  readonly filePath: string;
  /** Whether the file already existed (false = created cleanly). */
  readonly fileExisted: boolean;
  /** Top-level keys preserved verbatim by the merge (never clobbered). */
  readonly preservedKeys: readonly string[];
  /** Keys the adapter adds/modifies, e.g. the tool name under its section. */
  readonly addedKeys: readonly string[];
  /**
   * The exact merged JSON document; `null` when the existing config was
   * blocked (see {@link ConfigurationChange.problems}).
   */
  readonly mergedDocument: Readonly<Record<string, unknown>> | null;
  /** True when the tool entry is already configured identically (no write). */
  readonly alreadyConfigured: boolean;
  /** Why the change cannot be applied safely, if any. */
  readonly problems: readonly string[];
  /** Short human description of the change. */
  readonly description: string;
  /** Backup file created before a real write; `null` before writing / in a
   *  dry run / for a created (previously absent) file. */
  readonly backupPath: string | null;
  /** Read-back verification after apply; `null` before applying. */
  readonly verified: ConfigurationVerification | null;
}

/** Everything the Configurator promises about one request, read-only. */
export interface ConfigurationPlan {
  readonly toolName: string;
  /** The user-config root the target paths were derived from. */
  readonly configHome: string;
  /** Applicability verdict per implemented target. */
  readonly targets: readonly ConfigurationTargetCheck[];
  /** The exact changes for applicable targets. */
  readonly changes: readonly ConfigurationChange[];
  /** True when applying would rewrite at least one config file. */
  readonly changesNeeded: boolean;
}

/** One target the apply step could not configure (with the reason). */
export interface ConfigurationTargetFailure {
  readonly target: string;
  readonly label: string;
  readonly error: string;
}

/** The honest result of one configure run (or a dry run). */
export interface ConfigureOutcome {
  readonly toolName: string;
  readonly configHome: string;
  /** True when nothing was written (the plan was rendered instead). */
  readonly dryRun: boolean;
  /** Targets whose config file was actually written. */
  readonly appliedTargets: readonly string[];
  /** Applied targets whose written config was re-read and verified. */
  readonly verifiedTargets: readonly string[];
  /** Applicable targets already configured identically (nothing to do). */
  readonly skippedTargets: readonly string[];
  /** Applicable targets that could not be configured (with reasons). */
  readonly failedTargets: readonly ConfigurationTargetFailure[];
  /** Applicability verdicts the run was based on. */
  readonly targetChecks: readonly ConfigurationTargetCheck[];
  /** The changes made (or, in a dry run, that would be made). */
  readonly changes: readonly ConfigurationChange[];
}
