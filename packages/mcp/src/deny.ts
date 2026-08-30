import { denyFilter } from "@atlas/sdk";

/**
 * Path-only secret deny-filter for MCP tool handlers (beta audit Fix 6).
 *
 * The context-integration deny-filter guards context *assembly*; this wrapper
 * applies the same policy to *tool reads* so `.env*`, private keys,
 * `secrets.json`, and similar files can never be read through MCP tools,
 * regardless of what the index contains. The content scan is skipped (empty
 * content), so this is a pure path decision — fail closed.
 */
export function isDeniedPath(path: string): boolean {
  return !denyFilter(path, "").accepted;
}
