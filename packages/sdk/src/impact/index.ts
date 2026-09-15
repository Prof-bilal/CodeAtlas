// @prof-bilal/atlas-sdk — Impact service composition

import type { GraphPort, ImpactPort } from "@prof-bilal/atlas-core";
import { ImpactService } from "@prof-bilal/atlas-graph";

export interface CreateImpactServiceOptions {
  /** A GraphPort instance to query. */
  readonly graph: GraphPort;
}

/**
 * Create an ImpactPort backed by the graph service.
 * The graph must be pre-populated (run `indexProject()` first).
 */
export function createImpactService(options: CreateImpactServiceOptions): ImpactPort {
  return new ImpactService(options.graph);
}

export type {
  AffectedNode,
  ImpactOptions,
  ImpactPort,
  ImpactResult,
  ImpactRiskScore,
  ImpactSubject,
} from "@prof-bilal/atlas-core";
