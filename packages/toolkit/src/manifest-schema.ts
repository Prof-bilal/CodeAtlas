import type { ToolInstallMethodType, ToolSecurityStatusValue, ToolTrustLevel } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { ManifestSchemaVersionError, ManifestValidationError } from "./errors";
import { INSTALL_METHOD_TYPES, SECURITY_STATUSES, TRUST_LEVELS } from "./schema";

/**
 * Current schema version of the Tool Manifest. Bump when the manifest shape
 * changes; a version mismatch fails loudly (never silently migrated).
 */
export const TOOL_MANIFEST_SCHEMA_VERSION = 1;

/**
 * Where an installed tool came from. `registry` means it was installed through
 * a curated registry entry (`sourceRef` records the entry name); the ecosystem
 * kinds mean it was installed directly from that distribution channel;
 * `manual` means CodeAtlas did not perform the install.
 */
export type ToolManifestSourceKind =
  | "registry"
  | "npm"
  | "pip"
  | "cargo"
  | "go"
  | "binary"
  | "github-release"
  | "mcp"
  | "skill"
  | "manual";

/** The closed set of {@link ToolManifestSourceKind} values. */
export const TOOL_MANIFEST_SOURCE_KINDS: readonly ToolManifestSourceKind[] = [
  "registry",
  "npm",
  "pip",
  "cargo",
  "go",
  "binary",
  "github-release",
  "mcp",
  "skill",
  "manual",
];

/** How a tool is configured (Task 23 applies; here it is declared/recorded). */
export type ToolManifestConfigurationType = "automatic" | "manual" | "none";

/** The closed set of {@link ToolManifestConfigurationType} values. */
export const TOOL_MANIFEST_CONFIGURATION_TYPES: readonly ToolManifestConfigurationType[] = [
  "automatic",
  "manual",
  "none",
];

/** Result of verifying the installed artifact (checksum/signature). */
export type ToolVerificationStatus = "verified" | "unverified" | "failed";

/** The closed set of {@link ToolVerificationStatus} values. */
export const TOOL_VERIFICATION_STATUSES: readonly ToolVerificationStatus[] = [
  "verified",
  "unverified",
  "failed",
];

/** The doctor-able integration state (Task 22/25 reconciles expected vs actual). */
export type ToolIntegrationStateStatus =
  | "expected"
  | "installed"
  | "missing"
  | "broken"
  | "unknown";

/** The closed set of {@link ToolIntegrationStateStatus} values. */
export const TOOL_INTEGRATION_STATE_STATUSES: readonly ToolIntegrationStateStatus[] = [
  "expected",
  "installed",
  "missing",
  "broken",
  "unknown",
];

/** A runtime the tool requires (e.g. Node >= 20.19.0). Evaluated by Task 21. */
export interface ToolManifestRuntime {
  readonly name: string;
  /** Version range (semver) the tool needs, or `null`. */
  readonly versionRange: string | null;
}

/**
 * Declared compatibility requirements of the tool — **evaluated** by the
 * Compatibility Engine (Task 21), never by the manifest itself.
 */
export interface ToolManifestCompatibility {
  /** OS identifiers the tool runs on (`"win32"`, `"linux"`, `"darwin"`, …). */
  readonly os: readonly string[];
  /** Runtime requirements (Node, Python, Go, …). */
  readonly runtimes: readonly ToolManifestRuntime[];
  /** AI agent CLIs the tool integrates with. */
  readonly agents: readonly string[];
  /** Whether the tool requires an MCP runtime. */
  readonly mcp: boolean;
  /** CPU architectures supported (`"x64"`, `"arm64"`, …). */
  readonly architecture: readonly string[];
  /** Permissions the tool needs (network, filesystem, processes, …). */
  readonly permissions: readonly string[];
  readonly note: string | null;
}

/**
 * Declared installation requirement of the tool — **executed** by the Installer
 * (Task 22), never executed here. The manifest only describes how the tool is
 * installed (`type`, `package`, `source`, `checksum`, `versionRange`).
 */
export interface ToolManifestInstallation {
  /** Distribution mechanism (`npm`, `pip`, `cargo`, `go`, `binary`,
   *  `github-release`, `mcp`). */
  readonly type: ToolInstallMethodType;
  /** Package id on the ecosystem (npm name, PyPI project, crate, go module,
   *  `org/repo` for releases), or `null`. */
  readonly package: string | null;
  /** Download source for `binary` / `github-release` installs, or `null`. */
  readonly source: string | null;
  /** Expected artifact checksum (`algorithm:hex`), or `null`. The Installer
   *  verifies it (Task 22); it is never trusted implicitly. */
  readonly checksum: string | null;
  /** Semver range the install must satisfy, or `null`. */
  readonly versionRange: string | null;
  readonly note: string | null;
}

/**
 * How a tool is configured plus the applied configuration. Task 23 (the
 * Configurator) reads the declared shape and writes the applied state.
 */
export interface ToolManifestConfiguration {
  readonly type: ToolManifestConfigurationType;
  /** Config keys/targets actually written. */
  readonly applied: readonly string[];
  /** Agents the tool was configured for. */
  readonly agents: readonly string[];
  readonly note: string | null;
}

/**
 * The security / trust assessment that applied at install time. **Evaluated**
 * by Task 24 — the manifest only records the snapshot. The honest default is
 * `unverified`: CodeAtlas never claims an audit it has not performed.
 */
export interface ToolManifestSecurity {
  readonly status: ToolSecurityStatusValue;
  readonly trust: ToolTrustLevel;
  /** ISO date of the last CodeAtlas review pass, or `null`. */
  readonly lastReview: string | null;
  readonly note: string | null;
}

/** Where and how a tool was installed — the install-time audit trail. */
export interface ToolManifestProvenance {
  readonly source: ToolManifestSourceKind;
  /** Registry entry name / package id / release URL the install came from. */
  readonly sourceRef: string | null;
  /** The distribution mechanism actually used. */
  readonly method: ToolInstallMethodType;
  /** The exact command executed, as an **argument array** (never a shell
   *  string), or `null`. */
  readonly command: readonly string[] | null;
  /** ISO-8601 timestamp of the recorded install. */
  readonly recordedAt: string;
}

/** The verification result recorded at install time (Task 22 writes this). */
export interface ToolManifestVerification {
  readonly status: ToolVerificationStatus;
  /** The checksum that was actually verified, or `null`. */
  readonly checksum: string | null;
  readonly note: string | null;
}

/**
 * A doctor-able integration state: whether the installed artifact is where the
 * manifest expects it to be. `atlas tools doctor` (Task 25) reconciles
 * `expectedPath` against the environment.
 */
export interface ToolManifestIntegrationState {
  readonly status: ToolIntegrationStateStatus;
  /** Where the tool binary/config is expected to live. */
  readonly expectedPath: string | null;
  /** Where it was actually found by a doctor check. */
  readonly foundPath: string | null;
  /** ISO-8601 timestamp of the last check, or `null`. */
  readonly checkedAt: string | null;
  readonly note: string | null;
}

/**
 * The Tool Manifest (Task 20): the versioned, validated, extensible record of
 * **one installed tool** on the user's machine. It is the per-installed-tool
 * state that the Compatibility (21), Installer (22), Configurator (23), and
 * Security/Trust (24) tasks read and write. It mirrors the Scanner manifest
 * pattern and lives in `.codeatlas/tools/`.
 *
 * The manifest is **untrusted input** when loaded from disk: it is validated
 * on load and before any write, and nothing from it is ever executed.
 */
export interface ToolManifest {
  /** Manifest schema version (see {@link TOOL_MANIFEST_SCHEMA_VERSION}). */
  readonly schemaVersion: number;
  /** Tool id — unique per install. */
  readonly name: string;
  readonly description: string;
  /** The installed tool version. */
  readonly toolVersion: string;
  readonly repository: string | null;
  readonly license: string;
  /** Extensible category tags (any non-empty strings). */
  readonly categories: readonly string[];
  /** AI agents this tool was configured for. */
  readonly supportedAgents: readonly string[];
  readonly documentation: string | null;
  readonly compatibility: ToolManifestCompatibility;
  readonly installation: ToolManifestInstallation;
  readonly configuration: ToolManifestConfiguration;
  readonly security: ToolManifestSecurity;
  readonly provenance: ToolManifestProvenance;
  readonly verification: ToolManifestVerification;
  readonly integrationState: ToolManifestIntegrationState;
  /** ISO-8601 timestamp of the first install (preserved across saves). */
  readonly installedAt: string;
  /** ISO-8601 timestamp of the most recent update. */
  readonly updatedAt: string;
  /**
   * Unknown-but-well-formed top-level fields, preserved verbatim across
   * serialize/parse so forward-compatible tools never lose data. Never
   * required for validation and never executed.
   */
  readonly extra: Readonly<Record<string, unknown>>;
}

/** The honest default compatibility: nothing declared. */
export const DEFAULT_MANIFEST_COMPATIBILITY: ToolManifestCompatibility = {
  os: [],
  runtimes: [],
  agents: [],
  mcp: false,
  architecture: [],
  permissions: [],
  note: null,
};

/** The honest default configuration: nothing applied yet. */
export const DEFAULT_MANIFEST_CONFIGURATION: ToolManifestConfiguration = {
  type: "none",
  applied: [],
  agents: [],
  note: null,
};

/** The honest default security snapshot: not reviewed, not trusted. */
export const DEFAULT_MANIFEST_SECURITY: ToolManifestSecurity = {
  status: "unverified",
  trust: "unverified",
  lastReview: null,
  note: null,
};

/** The honest default verification: not verified yet. */
export const DEFAULT_MANIFEST_VERIFICATION: ToolManifestVerification = {
  status: "unverified",
  checksum: null,
  note: null,
};

/** The honest default integration state: not checked yet. */
export const DEFAULT_MANIFEST_INTEGRATION_STATE: ToolManifestIntegrationState = {
  status: "unknown",
  expectedPath: null,
  foundPath: null,
  checkedAt: null,
  note: null,
};

/** All top-level keys the schema understands (excluding the internal `extra`). */
const SERIALIZED_FIELD_ORDER: readonly string[] = [
  "schemaVersion",
  "name",
  "description",
  "toolVersion",
  "repository",
  "license",
  "categories",
  "supportedAgents",
  "documentation",
  "compatibility",
  "installation",
  "configuration",
  "security",
  "provenance",
  "verification",
  "integrationState",
  "installedAt",
  "updatedAt",
];

/** Every known key, including the reserved internal `extra` bucket. */
const KNOWN_FIELDS: ReadonlySet<string> = new Set([...SERIALIZED_FIELD_ORDER, "extra"]);

/**
 * Validate one raw manifest payload against the schema. Unknown-but-well-formed
 * top-level fields are **preserved** in the returned manifest's `extra` bucket
 * rather than rejected. Fails loudly: any problem produces a
 * `ManifestValidationError` listing every issue — a malformed manifest is never
 * silently repaired or partially accepted.
 */
export function validateToolManifest(
  input: unknown,
  expectedVersion: number = TOOL_MANIFEST_SCHEMA_VERSION,
): Result<ToolManifest> {
  const problems: string[] = [];
  if (!isRecord(input)) {
    return fail(new ManifestValidationError("<manifest>", ["must be an object"]));
  }
  if (input["schemaVersion"] !== expectedVersion) {
    return fail(new ManifestSchemaVersionError(expectedVersion, input["schemaVersion"]));
  }
  if (hasOwn(input, "extra") && !isRecord(input["extra"])) {
    problems.push("extra: must be an object");
  }

  const name = requiredString(input["name"], "name", problems);
  const description = requiredString(input["description"], "description", problems);
  const toolVersion = requiredString(input["toolVersion"], "toolVersion", problems);
  const license = requiredString(input["license"], "license", problems);
  const repository = optionalUrl(input["repository"], "repository", problems);
  const documentation = optionalUrl(input["documentation"], "documentation", problems);
  const categories = optionalStringArray(input["categories"], "categories", problems) ?? [];
  const supportedAgents =
    optionalStringArray(input["supportedAgents"], "supportedAgents", problems) ?? [];

  const compatibility =
    optionalCompatibility(input["compatibility"], problems) ?? DEFAULT_MANIFEST_COMPATIBILITY;
  const installation = requiredInstallation(input["installation"], problems);
  const configuration =
    optionalConfiguration(input["configuration"], problems) ?? DEFAULT_MANIFEST_CONFIGURATION;
  const security =
    optionalManifestSecurity(input["security"], problems) ?? DEFAULT_MANIFEST_SECURITY;
  const verification =
    optionalVerification(input["verification"], problems) ?? DEFAULT_MANIFEST_VERIFICATION;
  const integrationState =
    optionalIntegrationState(input["integrationState"], problems) ??
    DEFAULT_MANIFEST_INTEGRATION_STATE;

  const installedAt = requiredIsoTimestamp(input["installedAt"], "installedAt", problems);
  const updatedAt = requiredIsoTimestamp(input["updatedAt"], "updatedAt", problems);
  const provenance =
    optionalProvenance(input["provenance"], problems) ??
    defaultProvenance(installation.type, installedAt);

  if (problems.length > 0) {
    return fail(new ManifestValidationError(name || "<manifest>", problems));
  }

  return ok({
    schemaVersion: expectedVersion,
    name,
    description,
    toolVersion,
    repository,
    license,
    categories,
    supportedAgents,
    documentation,
    compatibility,
    installation,
    configuration,
    security,
    provenance,
    verification,
    integrationState,
    installedAt,
    updatedAt,
    extra: collectExtra(input),
  });
}

/**
 * Serialize a manifest to pretty-printed JSON (2-space indent, trailing
 * newline — the Scanner manifest convention). Unknown fields preserved in
 * `extra` are re-emitted as top-level keys; known fields always win.
 */
export function serializeToolManifest(manifest: ToolManifest): string {
  const entries: Array<[string, unknown]> = [];
  const value = manifest as unknown as Readonly<Record<string, unknown>>;
  for (const key of SERIALIZED_FIELD_ORDER) {
    entries.push([key, value[key]]);
  }
  for (const [key, unknownValue] of Object.entries(manifest.extra)) {
    if (!KNOWN_FIELDS.has(key)) {
      entries.push([key, unknownValue]);
    }
  }
  return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
}

/**
 * Parse a manifest from a JSON string (or an already-parsed value) and validate
 * it. The manifest is **untrusted input**: malformed JSON or invalid content
 * throws a typed {@link ManifestError} (never a crash), and nothing from the
 * content is ever executed. Unknown-but-well-formed fields are preserved.
 */
export function parseToolManifest(raw: string | unknown): ToolManifest {
  let input: unknown = raw;
  if (typeof raw === "string") {
    try {
      input = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new ManifestValidationError("<manifest>", [
        `not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ]);
    }
  }
  const result = validateToolManifest(input);
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** JSON cannot express `undefined`, so absent fields are `null` or missing. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/.test(value);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

function isIsoTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function requiredString(value: unknown, key: string, problems: string[]): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  problems.push(`${key}: is required and must be a non-empty string`);
  return "";
}

function optionalString(value: unknown, key: string, problems: string[]): string | null {
  if (isAbsent(value)) {
    return null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  problems.push(`${key}: must be a non-empty string`);
  return null;
}

function optionalUrl(value: unknown, key: string, problems: string[]): string | null {
  if (isAbsent(value)) {
    return null;
  }
  if (typeof value === "string" && isUrl(value)) {
    return value;
  }
  problems.push(`${key}: must be an http(s) URL string`);
  return null;
}

function optionalIsoDate(value: unknown, key: string, problems: string[]): string | null {
  if (isAbsent(value)) {
    return null;
  }
  if (typeof value === "string" && isIsoDate(value)) {
    return value;
  }
  problems.push(`${key}: must be an ISO date string (YYYY-MM-DD)`);
  return null;
}

function optionalIsoTimestamp(value: unknown, key: string, problems: string[]): string | null {
  if (isAbsent(value)) {
    return null;
  }
  if (typeof value === "string" && isIsoTimestamp(value)) {
    return value;
  }
  problems.push(`${key}: must be an ISO-8601 timestamp`);
  return null;
}

function requiredIsoTimestamp(value: unknown, key: string, problems: string[]): string {
  if (typeof value === "string" && isIsoTimestamp(value)) {
    return value;
  }
  problems.push(`${key}: is required and must be an ISO-8601 timestamp`);
  return "";
}

function optionalBoolean(value: unknown, key: string, problems: string[]): boolean | null {
  if (isAbsent(value)) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  problems.push(`${key}: must be a boolean`);
  return null;
}

function optionalStringArray(
  value: unknown,
  key: string,
  problems: string[],
): readonly string[] | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!Array.isArray(value)) {
    problems.push(`${key}: must be an array of non-empty strings`);
    return null;
  }
  if (value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    problems.push(`${key}: must contain only non-empty strings`);
    return null;
  }
  return value;
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  key: string,
  problems: string[],
): T | null {
  if (isAbsent(value)) {
    return null;
  }
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }
  problems.push(`${key}: must be one of ${allowed.join(", ")}`);
  return null;
}

function optionalCompatibility(
  value: unknown,
  problems: string[],
): ToolManifestCompatibility | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!isRecord(value)) {
    problems.push("compatibility: must be an object");
    return null;
  }
  const os = optionalStringArray(value["os"], "compatibility.os", problems) ?? [];
  const runtimes = optionalRuntimes(value["runtimes"], "compatibility.runtimes", problems) ?? [];
  const agents = optionalStringArray(value["agents"], "compatibility.agents", problems) ?? [];
  const mcp = optionalBoolean(value["mcp"], "compatibility.mcp", problems) ?? false;
  const architecture =
    optionalStringArray(value["architecture"], "compatibility.architecture", problems) ?? [];
  const permissions =
    optionalStringArray(value["permissions"], "compatibility.permissions", problems) ?? [];
  const note = optionalString(value["note"], "compatibility.note", problems);
  return { os, runtimes, agents, mcp, architecture, permissions, note };
}

function optionalRuntimes(
  value: unknown,
  key: string,
  problems: string[],
): readonly ToolManifestRuntime[] | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!Array.isArray(value)) {
    problems.push(`${key}: must be an array`);
    return null;
  }
  const result: ToolManifestRuntime[] = [];
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      problems.push(`${key}[${index}]: must be an object`);
      return;
    }
    const name = optionalString(entry["name"], `${key}[${index}].name`, problems);
    if (name === null) {
      return;
    }
    let runtime: ToolManifestRuntime = { name, versionRange: null };
    if (!isAbsent(entry["versionRange"])) {
      const versionRange = optionalString(
        entry["versionRange"],
        `${key}[${index}].versionRange`,
        problems,
      );
      if (versionRange !== null) {
        runtime = { ...runtime, versionRange };
      }
    }
    result.push(runtime);
  });
  return result;
}

function requiredInstallation(value: unknown, problems: string[]): ToolManifestInstallation {
  if (isAbsent(value)) {
    problems.push("installation: is required and must be an object with a valid type");
    return {
      type: "mcp",
      package: null,
      source: null,
      checksum: null,
      versionRange: null,
      note: null,
    };
  }
  if (!isRecord(value)) {
    problems.push("installation: must be an object");
    return {
      type: "mcp",
      package: null,
      source: null,
      checksum: null,
      versionRange: null,
      note: null,
    };
  }
  const type =
    optionalEnum(value["type"], INSTALL_METHOD_TYPES, "installation.type", problems) ?? "mcp";
  const pkg = optionalString(value["package"], "installation.package", problems);
  const source = optionalString(value["source"], "installation.source", problems);
  const checksum = optionalString(value["checksum"], "installation.checksum", problems);
  const versionRange = optionalString(value["versionRange"], "installation.versionRange", problems);
  const note = optionalString(value["note"], "installation.note", problems);
  return { type, package: pkg, source, checksum, versionRange, note };
}

function optionalConfiguration(
  value: unknown,
  problems: string[],
): ToolManifestConfiguration | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!isRecord(value)) {
    problems.push("configuration: must be an object");
    return null;
  }
  const type =
    optionalEnum(
      value["type"],
      TOOL_MANIFEST_CONFIGURATION_TYPES,
      "configuration.type",
      problems,
    ) ?? "none";
  const applied = optionalStringArray(value["applied"], "configuration.applied", problems) ?? [];
  const agents = optionalStringArray(value["agents"], "configuration.agents", problems) ?? [];
  const note = optionalString(value["note"], "configuration.note", problems);
  return { type, applied, agents, note };
}

function optionalManifestSecurity(value: unknown, problems: string[]): ToolManifestSecurity | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!isRecord(value)) {
    problems.push("security: must be an object");
    return null;
  }
  const status =
    optionalEnum(value["status"], SECURITY_STATUSES, "security.status", problems) ?? "unverified";
  const trust =
    optionalEnum(value["trust"], TRUST_LEVELS, "security.trust", problems) ?? "unverified";
  const lastReview = optionalIsoDate(value["lastReview"], "security.lastReview", problems);
  const note = optionalString(value["note"], "security.note", problems);
  return { status, trust, lastReview, note };
}

function optionalVerification(value: unknown, problems: string[]): ToolManifestVerification | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!isRecord(value)) {
    problems.push("verification: must be an object");
    return null;
  }
  const status =
    optionalEnum(value["status"], TOOL_VERIFICATION_STATUSES, "verification.status", problems) ??
    "unverified";
  const checksum = optionalString(value["checksum"], "verification.checksum", problems);
  const note = optionalString(value["note"], "verification.note", problems);
  return { status, checksum, note };
}

function optionalIntegrationState(
  value: unknown,
  problems: string[],
): ToolManifestIntegrationState | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!isRecord(value)) {
    problems.push("integrationState: must be an object");
    return null;
  }
  const status =
    optionalEnum(
      value["status"],
      TOOL_INTEGRATION_STATE_STATUSES,
      "integrationState.status",
      problems,
    ) ?? "unknown";
  const expectedPath = optionalString(
    value["expectedPath"],
    "integrationState.expectedPath",
    problems,
  );
  const foundPath = optionalString(value["foundPath"], "integrationState.foundPath", problems);
  const checkedAt = optionalIsoTimestamp(
    value["checkedAt"],
    "integrationState.checkedAt",
    problems,
  );
  const note = optionalString(value["note"], "integrationState.note", problems);
  return { status, expectedPath, foundPath, checkedAt, note };
}

function optionalProvenance(value: unknown, problems: string[]): ToolManifestProvenance | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!isRecord(value)) {
    problems.push("provenance: must be an object");
    return null;
  }
  const source = optionalEnum(
    value["source"],
    TOOL_MANIFEST_SOURCE_KINDS,
    "provenance.source",
    problems,
  );
  const method = optionalEnum(value["method"], INSTALL_METHOD_TYPES, "provenance.method", problems);
  const sourceRef = optionalString(value["sourceRef"], "provenance.sourceRef", problems);
  const command = optionalStringArray(value["command"], "provenance.command", problems);
  const recordedAt = requiredIsoTimestamp(value["recordedAt"], "provenance.recordedAt", problems);
  if (source === null || method === null) {
    return null;
  }
  return { source, sourceRef, method, command, recordedAt };
}

function defaultProvenance(
  method: ToolInstallMethodType,
  recordedAt: string,
): ToolManifestProvenance {
  return { source: "manual", sourceRef: null, method, command: null, recordedAt };
}

/**
 * Collect unknown-but-well-formed top-level fields into the `extra` bucket.
 * Revalidating an already-parsed manifest (whose unknowns live in its own
 * `extra`) must not re-nest the bucket, so `extra` is treated as a reserved key
 * while a raw input's literal `extra` key is still preserved.
 */
function collectExtra(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const fromBucket =
    hasOwn(input, "extra") && isRecord(input["extra"])
      ? Object.fromEntries(Object.entries(input["extra"]).filter(([key]) => !KNOWN_FIELDS.has(key)))
      : {};
  const topLevel = Object.fromEntries(
    Object.entries(input).filter(([key]) => !KNOWN_FIELDS.has(key) && key !== "extra"),
  );
  return { ...fromBucket, ...topLevel };
}
