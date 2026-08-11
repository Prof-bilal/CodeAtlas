import type { FilePath, NodeId, SymbolId } from "@atlas/shared";

/**
 * The deterministic {@link NodeId} for a symbol node. Stable across runs, so
 * callers can map a {@link GraphNode} back to its {@link Symbol}.
 */
export function symbolNodeId(symbolId: SymbolId): NodeId {
  return `n:${symbolId}` as NodeId;
}

/**
 * The deterministic {@link NodeId} for a file pseudo-node. Path separators are
 * normalized to `/` so the same file yields the same id on every platform.
 */
export function fileNodeId(path: FilePath): NodeId {
  return `n:file:${path.replace(/\\/g, "/")}` as NodeId;
}
