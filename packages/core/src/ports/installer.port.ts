import type { Result } from "@atlas/shared";
import type { CompatibilityEvaluationInput } from "./compatibility.port";
import type { SecurityAssessment } from "./security.port";
import type {
  ToolInstallMethodType,
  ToolSecurityStatusValue,
  ToolTrustLevel,
} from "./tool-registry.port";

/**
 * The Agent Toolkit — Tool Installer contract (Direction C, Task 22).
 *
 * Safely installs tools described by the CodeAtlas registry / Tool Manifests,
 * **through official distribution channels only**, with explicit user approval
 * and recorded provenance. This port is implemented in `@atlas/toolkit` with
 * **one adapter per ecosystem** (`npm`, `pip`, `cargo`, `go`, `binary`,
 * `github-release`, `mcp`) mirroring the `ProviderPort` / `AgentPort` adapter
 * pattern — a new ecosystem is a new small adapter, not a fork. The MVP
 * implements a safe subset of those adapters; the port reports the implemented
 * types via {@link InstallerPort.implementedTypes}.
 *
 * Trust rules the port enforces (see `docs/AGENT_TOOLKIT.md` §5 and
 * `docs/SECURITY.md`):
 * - **Never** executes arbitrary repository / third-party install scripts.
 * - **Never** builds a shell string — every command is an **argument array**
 *   (`spawn(file, argsArray)`, `shell: false`), so manifest/registry/AI-derived
 *   content can never inject shell syntax.
 * - **No automatic install without explicit user approval** — unless the
 *   caller opts into an explicit automation mode (`approval`).
 * - Commands, working directories, and the install target are **validated**
 *   before anything runs; paths cannot escape the project.
 * - Errors and logs never contain env values / secrets.
 */
export interface InstallerPort {
  /** The install types this build can actually execute (a safe MVP subset). */
  readonly implementedTypes: readonly ToolInstallMethodType[];

  /**
   * Build the exact install plan for a tool — validate the tool, check
   * compatibility (Task 21), enforce the security gate, and produce the exact
   * argument-array command the user would be asked to approve. Nothing is
   * executed. This is what a UI shows *before* asking for consent.
   */
  plan(request: ToolInstallRequest): Promise<Result<InstallPlan>>;

  /**
   * Install a tool. Runs the same gates as {@link plan}, then **requires
   * approval**: `approval.granted === false` aborts with an
   * `InstallApprovalDeniedError` *before anything runs*. On success the outcome
   * records the exact command executed, the verification result, provenance
   * timestamp, and a bounded install log; on failure the previous state is
   * recorded and — when the tool was not already present — a best-effort
   * rollback (uninstall) is attempted.
   */
  install(request: ToolInstallRequest, approval: InstallApproval): Promise<Result<InstallOutcome>>;

  /** Remove an installed tool through its ecosystem adapter. */
  remove(request: ToolInstallRequest): Promise<Result<InstallRemovalOutcome>>;
}

/** The declared install instruction the Installer executes (structural twin of
 *  the manifest's `ToolManifestInstallation`). */
export interface ToolInstallInstruction {
  /** Distribution mechanism (`npm`, `pip`, `cargo`, `go`, …). */
  readonly type: ToolInstallMethodType;
  /** Package id on the ecosystem (npm name, PyPI project, crate, go module,
   *  `org/repo` for releases), or `null`. */
  readonly package: string | null;
  /** Download source for `binary` / `github-release` installs, or `null`. */
  readonly source: string | null;
  /** Expected artifact checksum (`algorithm:hex`), or `null`. */
  readonly checksum: string | null;
  /** Semver range the install must satisfy, or `null`. */
  readonly versionRange: string | null;
  /** Extra info — for `skill` installs this is the sub-path of the skill
   *  inside the cloned repo (e.g. `skills/mcp-builder`), or `null`/absent for
   *  a repo-root skill. */
  readonly note?: string | null;
}

/** The input to the installer — everything needed to gate, plan, execute, and
 *  record one install. */
export interface ToolInstallRequest {
  /** Tool id (unique per install; also the manifest file name). */
  readonly name: string;
  readonly description: string;
  readonly toolVersion: string;
  /** What to install and how — validated by the adapter. */
  readonly installation: ToolInstallInstruction;
  /** The security snapshot that applies (evaluated by Task 24 normally; the
   *  installer's gate blocks `blocked` and requires approval otherwise). */
  readonly security: {
    readonly status: ToolSecurityStatusValue;
    readonly trust: ToolTrustLevel;
    /** Short reason for the status; recorded in the Tool Manifest. */
    readonly note?: string | null;
  };
  /** Environment to gate against (Task 21) — OS/runtimes/agents/MCP/arch. */
  readonly compatibility: CompatibilityEvaluationInput;
  /** Project root; the `.codeatlas/` install log lives under it. */
  readonly cwd: string;
  /** Optional richer metadata recorded into the Tool Manifest (Task 20) at
   *  install time, e.g. from the Registry entry the tool was chosen from. */
  readonly license?: string | null;
  readonly repository?: string | null;
  readonly documentation?: string | null;
  readonly categories?: readonly string[];
  readonly supportedAgents?: readonly string[];
}

/** One executable command the installer would run (or did run). */
export interface InstallPlanCommand {
  /** Executable to spawn (e.g. `"npm"`); resolved via PATH. */
  readonly binary: string;
  /** The exact argument array — never a shell string. */
  readonly args: readonly string[];
  /** Working directory for the child, or `null` (inherit). */
  readonly cwd: string | null;
}

/** The exact, user-reviewable plan for one install. */
export interface InstallPlan {
  readonly toolName: string;
  readonly method: ToolInstallMethodType;
  /** The install command that would run. */
  readonly command: InstallPlanCommand;
  /** A best-effort uninstall (rollback) command, or `null` when unsupported. */
  readonly uninstallCommand: InstallPlanCommand | null;
  /** Human-readable description of what will happen. */
  readonly effect: string;
  /** Human-readable danger flags, surfaced *before* approval (e.g.
   *  `"network access"`, `"global install"`, `"runs post-install hooks"`). */
  readonly dangerous: readonly string[];
  /** The tool binary name the post-install verification looks for on PATH. */
  readonly verifyBinary: string;
  /**
   * Optional post-install verification for artifacts that are not a PATH binary
   * (e.g. a cloned skill): a path **relative to `cwd`** that must exist after
   * install. When set, verification checks that file/directory instead of
   * resolving `verifyBinary`. `null` = binary-style verification.
   */
  readonly verifyPath: string | null;
  readonly security: SecurityAssessment;
}

/** The user's consent. Approval is mandatory unless an explicit automation
 *  mode is in force — see {@link InstallerPort.install}. */
export interface InstallApproval {
  readonly granted: boolean;
  /** Optional human note (why it was granted/denied); never required. */
  readonly note?: string;
  readonly securityOverride?: { readonly granted: boolean; readonly note: string };
}

/** What the installer did on failure to restore the pre-install state. */
export type InstallRollbackStatus = "none" | "uninstalled";

/** The verification verdict after an install (post-install honest check). */
export type InstallVerificationStatus = "verified" | "unverified" | "failed";

/** The recorded result of one successful install. */
export interface InstallOutcome {
  readonly plan: InstallPlan;
  /**
   * Honest post-install verification state: `verified` (binary found + version
   * range satisfied), `unverified` (binary found but the version could not be
   * confirmed), or `failed` (binary missing / runnable check failed).
   */
  readonly verification: InstallVerificationStatus;
  /** Human detail for the verification verdict, or `null`. */
  readonly verificationNote: string | null;
  /** Child exit code of the install command, or `null`. */
  readonly exitCode: number | null;
  /** Rollback taken on failure; `"none"` on a clean install or when the tool
   *  was already present before this run. */
  readonly rollback: InstallRollbackStatus;
  /** ISO-8601 timestamp of the recorded install. */
  readonly recordedAt: string;
  /** Bounded log of the run (what ran, output summary, verdicts). */
  readonly log: readonly string[];
  /** Path of the recorded Tool Manifest (`<root>/.codeatlas/tools/<name>.json`),
   *  or `null` when persistence was skipped/failed. */
  readonly manifestPath: string | null;
}

export interface InstallRemovalOutcome {
  readonly toolName: string;
  readonly removed: boolean;
  readonly note: string;
}
