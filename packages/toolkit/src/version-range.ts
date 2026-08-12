/**
 * A minimal, documented semver-range matcher used by the Compatibility Engine
 * (Task 21). It is deliberately **not** the full npm-semver feature set — it
 * covers the comparisons tool manifests realistically declare, and every
 * unsupported construct fails closed (`false`), never guesses.
 *
 * Supported:
 * - `*` / empty range — any version.
 * - bare version `20.19.0` — exact match.
 * - comparison operators `>`, `>=`, `<`, `<=`, `=` (with or without space).
 * - caret `^20.19.0` and tilde `~20.19.0` lower/upper bounds.
 * - space-separated AND groups `>=20.0.0 <21.0.0`.
 * - `||` OR groups.
 *
 * Partial versions (`20`, `20.19`) are padded to `20.0.0` / `20.19.0`.
 * Prerelease qualifiers and hyphen ranges are out of scope and fail closed.
 */

export type VersionTuple = readonly [major: number, minor: number, patch: number];

const VERSION_PATTERN = /v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/;

/**
 * Extract the first semver-shaped version from arbitrary text (e.g. the output
 * of `python --version` → `3.12.1`). Returns `null` when none is present.
 */
export function extractVersion(text: string): string | null {
  const match = VERSION_PATTERN.exec(text.trim());
  if (match === null) {
    return null;
  }
  return toTuple(match).join(".");
}

/**
 * Whether the detected version satisfies the declared semver range. A range
 * that cannot be parsed — or a detected version that cannot be parsed — is
 * **not** a match (fail closed; the caller reports `unknown`, never a guess).
 */
export function satisfiesVersionRange(detectedVersion: string, range: string): boolean {
  const detected = parseVersion(detectedVersion);
  if (detected === null) {
    return false;
  }
  const trimmed = range.trim();
  if (trimmed === "" || trimmed === "*" || trimmed === "x" || trimmed === "X") {
    return true;
  }
  const orGroups = trimmed
    .split("||")
    .map((group) => group.trim())
    .filter((group) => group.length > 0);
  if (orGroups.length === 0) {
    return false;
  }
  return orGroups.some((group) => matchesAndGroup(detected, group));
}

function parseVersion(value: string): VersionTuple | null {
  const match = VERSION_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }
  return toTuple(match);
}

function toTuple(match: RegExpExecArray): VersionTuple {
  const [, major, minor = "0", patch = "0"] = match;
  return [Number(major), Number(minor), Number(patch)];
}

function compareVersions(a: VersionTuple, b: VersionTuple): number {
  for (let i = 0; i < 3; i += 1) {
    const delta = a[i] - b[i];
    if (delta !== 0) {
      return delta < 0 ? -1 : 1;
    }
  }
  return 0;
}

function matchesAndGroup(detected: VersionTuple, group: string): boolean {
  const { clauses, consumed } = expandClauses(group);
  if (clauses.length === 0) {
    return false;
  }
  // Anything left over (e.g. a prerelease suffix like `>=20.0.0-alpha` or a
  // hyphen range `20.0.0 - 21.0.0`) is out of scope — fail closed.
  if (group.slice(consumed).trim().length > 0) {
    return false;
  }
  return clauses.every(({ operator, version }) => satisfiesClause(detected, operator, version));
}

function satisfiesClause(detected: VersionTuple, operator: string, version: VersionTuple): boolean {
  const comparison = compareVersions(detected, version);
  switch (operator) {
    case ">":
      return comparison > 0;
    case ">=":
      return comparison >= 0;
    case "<":
      return comparison < 0;
    case "<=":
      return comparison <= 0;
    default:
      return comparison === 0;
  }
}

interface RangeClause {
  readonly operator: string;
  readonly version: VersionTuple;
}

interface ExpandedClauses {
  readonly clauses: readonly RangeClause[];
  /** Characters of the group consumed by version tokens. */
  readonly consumed: number;
}

function expandClauses(group: string): ExpandedClauses {
  const clauses: RangeClause[] = [];
  const tokenPattern = /(>=|<=|>|<|=|\^|~)?\s*(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?/g;
  let consumed = 0;
  for (;;) {
    const match = tokenPattern.exec(group);
    if (match === null) {
      break;
    }
    consumed = tokenPattern.lastIndex;
    const [, rawOperator = "=", majorRaw, minorRaw = "0", patchRaw = "0"] = match;
    const version: VersionTuple = [Number(majorRaw), Number(minorRaw), Number(patchRaw)];
    if (rawOperator === "^") {
      pushCaretClauses(clauses, version);
    } else if (rawOperator === "~") {
      clauses.push({ operator: ">=", version });
      clauses.push({ operator: "<", version: [version[0], version[1] + 1, 0] });
    } else {
      clauses.push({ operator: rawOperator, version });
    }
  }
  return { clauses, consumed };
}

function pushCaretClauses(clauses: RangeClause[], version: VersionTuple): void {
  clauses.push({ operator: ">=", version });
  if (version[0] > 0) {
    clauses.push({ operator: "<", version: [version[0] + 1, 0, 0] });
  } else if (version[1] > 0) {
    clauses.push({ operator: "<", version: [0, version[1] + 1, 0] });
  } else {
    clauses.push({ operator: "<", version: [0, 0, version[2] + 1] });
  }
}
