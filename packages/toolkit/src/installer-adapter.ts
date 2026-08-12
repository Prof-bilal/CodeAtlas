import type { InstallPlanCommand, ToolInstallMethodType, ToolInstallRequest } from "@atlas/core";
import type { Result } from "@atlas/shared";

/**
 * What one ecosystem adapter produces for a tool: the exact, safe, argument-array
 * install command, a best-effort uninstall command for rollback (or `null` when
 * the ecosystem cannot uninstall), the human-readable effect and danger flags
 * shown *before* approval, and the binary name the post-install verification
 * looks for on PATH.
 */
export interface AdapterPlan {
  readonly command: InstallPlanCommand;
  readonly uninstallCommand: InstallPlanCommand | null;
  readonly effect: string;
  readonly dangerous: readonly string[];
  readonly verifyBinary: string;
}

/**
 * One install instruction builds a plan (Task 22). The toolkit ships safe
 * adapters for the package-manager ecosystems; a new ecosystem is a **new small
 * adapter class**, never a fork of the installer.
 */
export interface EcosystemAdapter {
  readonly method: ToolInstallMethodType;
  /**
   * Build the exact plan for a request. Must validate every value derived from
   * the (untrusted) request before emitting it into an argument array, and
   * must set `command.cwd` to `request.cwd`.
   */
  build(request: ToolInstallRequest): Result<AdapterPlan>;
}

/** Collect every argument that flows from request content into an argv element. */
export function adapterProblems(request: ToolInstallRequest, problems: string[]): void {
  if (request.installation.package === null || request.installation.package === "") {
    problems.push(`package: is required for ${request.installation.type} installs`);
    return;
  }
  validateInstallArg(request.installation.package, "package", problems);
  if (request.installation.versionRange !== null) {
    validateVersionArg(request.installation.versionRange, "versionRange", problems);
  }
  if (request.installation.source !== null && request.installation.source !== "") {
    validateSourceUrl(request.installation.source, "source", problems);
  }
  if (request.installation.checksum !== null && request.installation.checksum !== "") {
    validateChecksum(request.installation.checksum, "checksum", problems);
  }
}

/**
 * Validate a package/id string that becomes part of an argv element. Rejects
 * control characters, whitespace, and leading `-` (so it can never be
 * interpreted as an option); `/` is allowed (scoped npm packages, Go module
 * paths). Path-separator-rich strings that would escape a directory are the
 * Tool Manifest name check's job — see `docs/TOOL_MANIFEST.md` §6.
 */
export function validateInstallArg(
  value: string,
  label: string,
  problems: string[],
): string | null {
  const candidate = value.trim();
  if (candidate.length === 0) {
    problems.push(`${label}: must be a non-empty string`);
    return null;
  }
  if (candidate.length > MAX_ARG_LENGTH) {
    problems.push(`${label}: too long (max ${MAX_ARG_LENGTH} characters)`);
    return null;
  }
  if (candidate.startsWith("-")) {
    problems.push(`${label}: must not start with "-" (no flag injection)`);
    return null;
  }
  if (/\s/.test(candidate)) {
    problems.push(`${label}: must not contain whitespace`);
    return null;
  }
  if (containsControlCharacters(candidate)) {
    problems.push(`${label}: must not contain control characters`);
    return null;
  }
  return candidate;
}

/**
 * Validate a version range that becomes part of an argv element. Ranges may
 * contain internal spaces (npm AND groups like `>=20.0.0 <21.0.0`), so only
 * control characters and a leading `-` are rejected; each adapter further
 * constrains which range shapes its ecosystem actually understands.
 */
export function validateVersionArg(
  value: string,
  label: string,
  problems: string[],
): string | null {
  const candidate = value.trim();
  if (candidate.length === 0) {
    problems.push(`${label}: must not be empty`);
    return null;
  }
  if (candidate.length > MAX_ARG_LENGTH) {
    problems.push(`${label}: too long (max ${MAX_ARG_LENGTH} characters)`);
    return null;
  }
  if (candidate.startsWith("-")) {
    problems.push(`${label}: must not start with "-" (no flag injection)`);
    return null;
  }
  if (containsControlCharacters(candidate)) {
    problems.push(`${label}: must not contain control characters`);
    return null;
  }
  return candidate;
}

/** Validate a download-source URL (`binary`/`github-release` installs). */
export function validateSourceUrl(value: string, label: string, problems: string[]): string | null {
  if (!/^https?:\/\/\S+$/.test(value)) {
    problems.push(`${label}: must be an http(s) URL`);
    return null;
  }
  return value;
}

/** Validate a checksum string (`algorithm:hex` or bare hex). */
export function validateChecksum(value: string, label: string, problems: string[]): string | null {
  if (!/^[A-Za-z0-9]+:[0-9a-fA-F]+$/.test(value) && !/^[0-9a-fA-F]{32,128}$/.test(value)) {
    problems.push(`${label}: must be "algorithm:hex" or a bare hex digest`);
    return null;
  }
  return value;
}

const MAX_ARG_LENGTH = 512;

/** Whether `value` contains C0 control characters (U+0000–U+001F) or DEL (U+007F). */
function containsControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * The executable name a package install is post-verified by: the last path
 * segment of the package/module id, with a leading `@` (npm scope) stripped.
 * This is a documented heuristic — some packages ship a differently-named bin —
 * and verification reports honestly when it cannot confirm the version.
 */
export function baseBinaryName(packageId: string): string {
  const trimmed = packageId.trim();
  const tail = trimmed.includes("/") ? trimmed.slice(trimmed.lastIndexOf("/") + 1) : trimmed;
  return tail.replace(/^@/, "");
}

/** A plan for one ecosystem, or a failed request validation. */
export type AdapterPlanResult = Result<AdapterPlan>;
