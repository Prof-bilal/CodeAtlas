/**
 * The Agent Toolkit — Tool Registry contract (Direction C, Task 19).
 *
 * The Registry is the authoritative **catalog of what exists** ("what is
 * there"): a curated, schema-validated list of open-source developer / AI-agent
 * tools. It is deliberately separate from the Tool Manifest (one installed
 * tool), the Compatibility Engine, the Installer, and the Security/Trust
 * evaluator — those later tasks consume these records but are **not**
 * implemented here.
 *
 * Trust rules the port enforces:
 * - External metadata (GitHub / npm / PyPI / Cargo / MCP directories) is an
 *   **advisory input only** — it must pass the curated pipeline. Every field
 *   carries a {@link FieldProvenance} so its origin is auditable, and CodeAtlas
 *   never auto-approves external metadata.
 * - `security` / `trust` are declared and validated here but **evaluated** by a
 *   later task (Task 24). The default is `unverified`.
 * - Categories are **extensible**: a record may use any non-empty string
 *   category, never just a fixed list.
 */
export interface ToolRegistryPort {
  /** Registry schema version the records were validated against. */
  readonly schemaVersion: number;

  /** All records — the curated catalog merged with the local overlay. */
  listTools(): readonly ToolRegistryRecord[];

  /** One record by name (overlay records win over catalog records), or
   *  `undefined`. */
  getTool(name: string): ToolRegistryRecord | undefined;

  /** The distinct, extensible category set across all records. */
  listCategories(): readonly string[];

  /** Which layer a record came from (`"catalog"` or `"overlay"`). */
  recordSource(name: string): ToolRegistrySource | undefined;
}

/** Which layer a record came from. */
export type ToolRegistrySource = "catalog" | "overlay";

/**
 * Where a metadata value came from. CodeAtlas never trusts external metadata
 * blindly — the origin of every field is recorded so the audit trail is
 * complete:
 * - **curated** — written/promoted by CodeAtlas curation;
 * - **external** — pulled from an external source (GitHub, npm, PyPI, …) and
 *   **not** independently verified;
 * - **user** — provided by the user via the local overlay;
 * - **unknown** — origin not recorded.
 */
export type ProvenanceSource = "curated" | "external" | "user" | "unknown";

/** Provenance of one metadata field. */
export interface FieldProvenance {
  readonly source: ProvenanceSource;
  /** Human-readable note (e.g. "npm metadata 2026-08-11, not verified"). */
  readonly note?: string;
}

/** Per-field provenance of a registry record — every field is auditable. */
export interface ToolProvenance {
  /** Provenance of the record as a whole (how it entered the registry). */
  readonly record: FieldProvenance;
  readonly name: FieldProvenance;
  readonly description: FieldProvenance;
  readonly repository: FieldProvenance;
  readonly website: FieldProvenance;
  readonly documentation: FieldProvenance;
  readonly license: FieldProvenance;
  readonly version: FieldProvenance;
  readonly categories: FieldProvenance;
  readonly supportedOs: FieldProvenance;
  readonly supportedAgents: FieldProvenance;
  readonly installMethods: FieldProvenance;
  readonly dependencies: FieldProvenance;
  readonly security: FieldProvenance;
  readonly trust: FieldProvenance;
  readonly maintainer: FieldProvenance;
  readonly lastUpdate: FieldProvenance;
  readonly stars: FieldProvenance;
}

/** A provenance map key (the `ToolProvenance` fields). */
export type ToolField = keyof ToolProvenance;

/** Official distribution mechanisms the Toolkit installs through. */
export type ToolInstallMethodType =
  | "npm"
  | "pip"
  | "cargo"
  | "go"
  | "binary"
  | "github-release"
  | "mcp";

/** One way a tool can be installed. Declared here, executed by Task 22. */
export interface InstallMethod {
  readonly type: ToolInstallMethodType;
  /** Package id on the ecosystem (npm name, PyPI project, crate, …). */
  readonly packageId?: string;
  /** Extra info (e.g. asset pattern for binary / release installs). */
  readonly note?: string;
}

/** A runtime dependency the tool declares. */
export interface ToolDependency {
  readonly name: string;
  readonly version?: string;
}

/**
 * Security status (Task 24 evaluates; this field is declared + validated).
 * `unverified` is the default — CodeAtlas never claims an audit it has not
 * performed.
 */
export type ToolSecurityStatusValue =
  | "verified"
  | "reviewed"
  | "community"
  | "unverified"
  | "blocked";

export interface ToolSecurityStatus {
  readonly status: ToolSecurityStatusValue;
  /** ISO date of the last CodeAtlas review pass, or `null` when never
   *  reviewed. */
  readonly lastReview: string | null;
  /** Short reason for the status. */
  readonly note?: string;
}

/** User-facing trust hierarchy (§8 of the design contract). */
export type ToolTrustLevel = "official" | "reviewed" | "community" | "unverified" | "blocked";

/**
 * One curated registry record — the metadata shape for a tool. The
 * install/compatibility/security fields are **declared and validated** here
 * but **evaluated** by later tasks (Compatibility = Task 21, Installer =
 * Task 22, Security/Trust = Task 24).
 */
export interface ToolRegistryRecord {
  /** Unique, stable id of the tool (also the overlay merge key). */
  readonly name: string;
  readonly description: string;
  /** Canonical source repository URL, or `null`. */
  readonly repository: string | null;
  /** Project homepage URL, or `null`. */
  readonly website: string | null;
  /** Documentation URL, or `null`. */
  readonly documentation: string | null;
  readonly license: string;
  readonly version: string;
  /**
   * Extensible category tags — never constrained to a fixed list. Suggested
   * starting categories (not exhaustive): Context, Token Optimization, MCP,
   * Code Analysis, Testing, AI Quality, Agent Tools, CLI Utilities,
   * Developer Productivity.
   */
  readonly categories: readonly string[];
  /** OS identifiers the tool supports (`"win32"`, `"linux"`, `"darwin"`, …);
   *  empty = not declared. */
  readonly supportedOs: readonly string[];
  /** AI agent ids the tool supports/integrates with (`"claude"`, `"gemini"`,
   *  `"codex"`, `"opencode"`, …); empty = not declared. */
  readonly supportedAgents: readonly string[];
  readonly installMethods: readonly InstallMethod[];
  readonly dependencies: readonly ToolDependency[];
  readonly security: ToolSecurityStatus;
  readonly trust: ToolTrustLevel;
  readonly maintainer: string | null;
  /** ISO date — a maintenance signal (**stars are not the quality signal**). */
  readonly lastUpdate: string | null;
  /** Weak popularity signal only — never a trust basis. */
  readonly stars: number | null;
  /** Origin of every field, so the record is auditable. */
  readonly provenance: ToolProvenance;
}
