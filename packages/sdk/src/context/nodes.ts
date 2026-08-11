import type { ContextSnapshot } from "@atlas/core";
import type { NodeId, SymbolId } from "@atlas/shared";

/**
 * Graph node-id helpers and snapshot label resolution for the Context SDK.
 *
 * The node-id scheme mirrors `@atlas/graph`, `@atlas/search`, and `@atlas/mcp`
 * without importing any of them (the SDK cannot import feature packages).
 */

/** Graph node id for a file (mirrors `@atlas/graph` without importing it). */
export function fileNodeId(path: string): NodeId {
  return `n:file:${path.replace(/\\/g, "/")}` as NodeId;
}

/** Graph node id for a symbol (mirrors `@atlas/graph` without importing it). */
export function symbolNodeId(symbolId: SymbolId): NodeId {
  return `n:${symbolId}` as NodeId;
}

/** Map every known graph node id to a human-readable label. */
export function buildNodeLabels(snapshot: ContextSnapshot): ReadonlyMap<NodeId, string> {
  const labels = new Map<NodeId, string>();
  for (const file of snapshot.files ?? []) {
    labels.set(fileNodeId(file.path), file.path);
  }
  for (const symbol of snapshot.symbols ?? []) {
    labels.set(symbolNodeId(symbol.id), `${symbol.name} (${symbol.filePath})`);
  }
  return labels;
}

/** True when `filePath` equals `dir` or lives under it (separators normalized). */
export function isUnderOrEqual(filePath: string, dir: string): boolean {
  if (filePath === dir) {
    return true;
  }
  const normalized = filePath.replace(/\\/g, "/");
  const dirNorm = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.startsWith(`${dirNorm}/`);
}
