import type { NodeId, Result } from "@atlas/shared";
import type { GraphEdge, GraphNode } from "../domain/entities";

/**
 * A cycle in the dependency graph: an ordered list of node ids where the last
 * node connects back to the first.
 */
export type Cycle = readonly NodeId[];

/** Builds and queries the code-dependency graph. */
export interface GraphPort {
  addNode(node: GraphNode): Promise<Result<void>>;
  addEdge(edge: GraphEdge): Promise<Result<void>>;
  /** Nodes directly related to `nodeId` (both incoming and outgoing edges). */
  neighbors(nodeId: NodeId): Promise<Result<readonly GraphNode[]>>;
  /** Nodes this node depends on (outgoing edges). */
  getDependencies(nodeId: NodeId): Promise<Result<readonly GraphNode[]>>;
  /** Nodes that depend on this node (incoming edges). */
  getDependents(nodeId: NodeId): Promise<Result<readonly GraphNode[]>>;
  /** Shortest directed path from `from` to `to`, or `null` when unreachable. */
  shortestPath(from: NodeId, to: NodeId): Promise<Result<readonly GraphNode[] | null>>;
  /** Every cycle in the graph, one representative per strongly connected component. */
  detectCircularDependencies(): Promise<Result<readonly Cycle[]>>;
  /** Serialize the graph to a JSON string (no visualization). */
  exportJson(): Promise<Result<string>>;
}
