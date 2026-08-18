import type {
  FieldProvenance,
  InstallMethod,
  ProvenanceSource,
  ToolDependency,
  ToolField,
  ToolInstallMethodType,
  ToolProvenance,
  ToolRegistryRecord,
  ToolSecurityStatus,
  ToolSecurityStatusValue,
  ToolTier,
  ToolTrustLevel,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { RegistrySchemaVersionError, RegistryValidationError } from "./errors";

/**
 * Current version of the registry schema. Bump when the record shape changes —
 * version 2 adds the `tier` curation field (P2-01).
 */
export const REGISTRY_SCHEMA_VERSION = 2;

/**
 * The **suggested** starting categories. Categories are deliberately NOT a
 * closed enum — records may use any non-empty string category, so the set
 * stays extensible. This list only documents the curation starting point.
 */
export const DEFAULT_CATEGORIES = [
  "Context",
  "Token Optimization",
  "MCP",
  "Code Analysis",
  "Testing",
  "AI Quality",
  "Agent Tools",
  "CLI Utilities",
  "Developer Productivity",
] as const;

/** Closed set of installation methods (executed by Task 22, declared here). */
export const INSTALL_METHOD_TYPES: readonly ToolInstallMethodType[] = [
  "npm",
  "pip",
  "cargo",
  "go",
  "binary",
  "github-release",
  "mcp",
  "skill",
];

/** Closed set of curation tiers (P2-01). */
export const TIERS: readonly ToolTier[] = [
  "recommended",
  "optional",
  "experimental",
  "incompatible",
];

/** Closed set of security statuses (evaluated by Task 24). */
export const SECURITY_STATUSES: readonly ToolSecurityStatusValue[] = [
  "verified",
  "reviewed",
  "community",
  "unverified",
  "blocked",
];

/** Closed set of trust levels (evaluated by Task 24). */
export const TRUST_LEVELS: readonly ToolTrustLevel[] = [
  "verified",
  "reviewed",
  "community",
  "unverified",
  "blocked",
];

const PROVENANCE_SOURCES: readonly ProvenanceSource[] = ["curated", "external", "user", "unknown"];

/** The default, honest security status: CodeAtlas has not audited the tool. */
export const DEFAULT_SECURITY: ToolSecurityStatus = {
  status: "unverified",
  lastReview: null,
};

export const DEFAULT_TRUST: ToolTrustLevel = "unverified";

/** The default curation tier: curated and installable, but not Top-N. */
export const DEFAULT_TIER: ToolTier = "optional";

/** A validated, versioned collection of registry records. */
export interface ToolRegistryCatalog {
  readonly schemaVersion: number;
  readonly records: readonly ToolRegistryRecord[];
}

const TOOL_FIELD_KEYS: readonly ToolField[] = [
  "record",
  "name",
  "description",
  "repository",
  "website",
  "documentation",
  "license",
  "version",
  "categories",
  "supportedOs",
  "supportedAgents",
  "installMethods",
  "dependencies",
  "security",
  "trust",
  "maintainer",
  "lastUpdate",
  "stars",
  "tier",
];

/**
 * Validate one raw registry record (catalog entry or overlay entry) against the
 * schema. `defaultSource` is the provenance applied to every field unless the
 * record overrides it — `"curated"` for shipped catalog entries, `"user"` for
 * overlay entries.
 *
 * Fails loudly: any malformed field produces a `RegistryValidationError`
 * listing every problem — records are never silently skipped or repaired.
 */
export function validateToolRecord(
  input: unknown,
  defaultSource: ProvenanceSource = "curated",
): Result<ToolRegistryRecord> {
  const problems: string[] = [];
  if (!isRecord(input)) {
    return fail(new RegistryValidationError("<record>", ["must be an object"]));
  }

  const name = requiredString(input["name"], "name", problems);
  const description = requiredString(input["description"], "description", problems);
  const license = requiredString(input["license"], "license", problems);
  const version = requiredString(input["version"], "version", problems);
  const categories = requiredStringArray(input["categories"], "categories", problems);
  const repository = optionalUrl(input["repository"], "repository", problems);
  const website = optionalUrl(input["website"], "website", problems);
  const documentation = optionalUrl(input["documentation"], "documentation", problems);
  const supportedOs = optionalStringArray(input["supportedOs"], "supportedOs", problems) ?? [];
  const supportedAgents =
    optionalStringArray(input["supportedAgents"], "supportedAgents", problems) ?? [];
  const installMethods =
    optionalInstallMethods(input["installMethods"], "installMethods", problems) ?? [];
  const dependencies = optionalDependencies(input["dependencies"], "dependencies", problems) ?? [];
  const security = optionalSecurity(input["security"], "security", problems) ?? DEFAULT_SECURITY;
  const trust = optionalEnum(input["trust"], TRUST_LEVELS, "trust", problems) ?? DEFAULT_TRUST;
  const maintainer = optionalString(input["maintainer"], "maintainer", problems);
  const lastUpdate = optionalIsoDate(input["lastUpdate"], "lastUpdate", problems);
  const stars = optionalNonNegativeInteger(input["stars"], "stars", problems);
  const tier = optionalEnum(input["tier"], TIERS, "tier", problems) ?? DEFAULT_TIER;
  const provenanceOverrides = optionalProvenance(input["provenance"], problems);

  if (problems.length > 0) {
    return fail(new RegistryValidationError(name, problems));
  }

  return ok({
    name,
    description,
    license,
    version,
    categories,
    repository,
    website,
    documentation,
    supportedOs,
    supportedAgents,
    installMethods,
    dependencies,
    security,
    trust,
    maintainer,
    lastUpdate,
    stars,
    tier,
    provenance: buildProvenance(defaultSource, provenanceOverrides),
  });
}

/**
 * Validate a whole catalog (or overlay) payload: the declared schema version
 * must match, and every record must validate. Malformed data fails loudly with
 * an aggregate of all record problems.
 */
export function validateCatalog(
  input: unknown,
  expectedVersion: number,
  defaultSource: ProvenanceSource = "curated",
): Result<ToolRegistryCatalog> {
  if (!isRecord(input)) {
    return fail(new RegistryValidationError("<catalog>", ["must be an object"]));
  }
  if (input["schemaVersion"] !== expectedVersion) {
    return fail(new RegistrySchemaVersionError(expectedVersion, input["schemaVersion"]));
  }
  if (!Array.isArray(input["tools"])) {
    return fail(new RegistryValidationError("<catalog>", ["tools: must be an array"]));
  }

  const records: ToolRegistryRecord[] = [];
  const failures: string[] = [];
  input["tools"].forEach((raw, index) => {
    const parsed = validateToolRecord(raw, defaultSource);
    if (parsed.ok) {
      records.push(parsed.value);
    } else {
      failures.push(`[${index}] ${parsed.error.message}`);
    }
  });
  if (failures.length > 0) {
    return fail(new RegistryValidationError("<catalog>", failures));
  }
  return ok({ schemaVersion: expectedVersion, records });
}

/** Validate a local overlay payload (same schema, user provenance default). */
export function validateOverlay(
  input: unknown,
  expectedVersion: number,
): Result<ToolRegistryCatalog> {
  return validateCatalog(input, expectedVersion, "user");
}

// ── field helpers ───────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON cannot express `undefined`, so optional fields may be `null`. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/.test(value);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
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

function optionalNonNegativeInteger(
  value: unknown,
  key: string,
  problems: string[],
): number | null {
  if (isAbsent(value)) {
    return null;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  problems.push(`${key}: must be a non-negative integer`);
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

function requiredStringArray(value: unknown, key: string, problems: string[]): readonly string[] {
  if (isAbsent(value)) {
    problems.push(`${key}: is required`);
    return [];
  }
  const array = optionalStringArray(value, key, problems);
  if (array === null) {
    return [];
  }
  if (array.length === 0) {
    problems.push(`${key}: must contain at least one category`);
    return [];
  }
  return array;
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

function optionalInstallMethods(
  value: unknown,
  key: string,
  problems: string[],
): readonly InstallMethod[] | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!Array.isArray(value)) {
    problems.push(`${key}: must be an array`);
    return null;
  }
  const result: InstallMethod[] = [];
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      problems.push(`${key}[${index}]: must be an object`);
      return;
    }
    const type = optionalEnum(
      entry["type"],
      INSTALL_METHOD_TYPES,
      `${key}[${index}].type`,
      problems,
    );
    if (type === null) {
      return;
    }
    let method: InstallMethod = { type };
    if (entry["packageId"] !== undefined) {
      const packageId = optionalString(entry["packageId"], `${key}[${index}].packageId`, problems);
      if (packageId !== null) {
        method = { ...method, packageId };
      }
    }
    if (entry["note"] !== undefined) {
      const note = optionalString(entry["note"], `${key}[${index}].note`, problems);
      if (note !== null) {
        method = { ...method, note };
      }
    }
    result.push(method);
  });
  return result;
}

function optionalDependencies(
  value: unknown,
  key: string,
  problems: string[],
): readonly ToolDependency[] | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!Array.isArray(value)) {
    problems.push(`${key}: must be an array`);
    return null;
  }
  const result: ToolDependency[] = [];
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      problems.push(`${key}[${index}]: must be an object`);
      return;
    }
    const name = optionalString(entry["name"], `${key}[${index}].name`, problems);
    if (name === null) {
      return;
    }
    let dependency: ToolDependency = { name };
    if (entry["version"] !== undefined) {
      const depVersion = optionalString(entry["version"], `${key}[${index}].version`, problems);
      if (depVersion !== null) {
        dependency = { ...dependency, version: depVersion };
      }
    }
    result.push(dependency);
  });
  return result;
}

function optionalSecurity(
  value: unknown,
  key: string,
  problems: string[],
): ToolSecurityStatus | null {
  if (isAbsent(value)) {
    return null;
  }
  if (!isRecord(value)) {
    problems.push(`${key}: must be an object`);
    return null;
  }
  const status = optionalEnum(value["status"], SECURITY_STATUSES, `${key}.status`, problems);
  if (status === null) {
    return null;
  }
  let security: ToolSecurityStatus = { status, lastReview: null };
  if (!isAbsent(value["lastReview"])) {
    const lastReview = optionalIsoDate(value["lastReview"], `${key}.lastReview`, problems);
    if (lastReview !== null) {
      security = { ...security, lastReview };
    }
  }
  if (value["note"] !== undefined) {
    const note = optionalString(value["note"], `${key}.note`, problems);
    if (note !== null) {
      security = { ...security, note };
    }
  }
  return security;
}

function optionalProvenance(
  value: unknown,
  problems: string[],
): Readonly<Partial<Record<ToolField, FieldProvenance>>> {
  if (isAbsent(value)) {
    return {};
  }
  if (!isRecord(value)) {
    problems.push("provenance: must be an object");
    return {};
  }
  const result: Partial<Record<ToolField, FieldProvenance>> = {};
  for (const [field, rawEntry] of Object.entries(value)) {
    if (!TOOL_FIELD_KEYS.includes(field as ToolField)) {
      problems.push(`provenance: unknown field "${field}"`);
      continue;
    }
    if (!isRecord(rawEntry)) {
      problems.push(`provenance.${field}: must be an object`);
      continue;
    }
    const source = optionalEnum(
      rawEntry["source"],
      PROVENANCE_SOURCES,
      `provenance.${field}.source`,
      problems,
    );
    if (source === null) {
      continue;
    }
    let entry: FieldProvenance = { source };
    if (rawEntry["note"] !== undefined) {
      const note = optionalString(rawEntry["note"], `provenance.${field}.note`, problems);
      if (note !== null) {
        entry = { ...entry, note };
      }
    }
    result[field as ToolField] = entry;
  }
  return result;
}

function buildProvenance(
  defaultSource: ProvenanceSource,
  overrides: Readonly<Partial<Record<ToolField, FieldProvenance>>>,
): ToolProvenance {
  const fallback: FieldProvenance = { source: defaultSource };
  const field = (key: ToolField): FieldProvenance => overrides[key] ?? fallback;
  return {
    record: field("record"),
    name: field("name"),
    description: field("description"),
    repository: field("repository"),
    website: field("website"),
    documentation: field("documentation"),
    license: field("license"),
    version: field("version"),
    categories: field("categories"),
    supportedOs: field("supportedOs"),
    supportedAgents: field("supportedAgents"),
    installMethods: field("installMethods"),
    dependencies: field("dependencies"),
    security: field("security"),
    trust: field("trust"),
    maintainer: field("maintainer"),
    lastUpdate: field("lastUpdate"),
    stars: field("stars"),
    tier: field("tier"),
  };
}
