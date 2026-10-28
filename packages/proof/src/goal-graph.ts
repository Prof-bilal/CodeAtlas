import type { ChangeSession, GoalCoverageGraph } from "@prof-bilal/atlas-core";

type GoalNode = GoalCoverageGraph["nodes"][number];
type GoalEdge = GoalCoverageGraph["edges"][number];

const MAX_NODES = 4000;
const MAX_EDGES = 8000;

/**
 * Project adopted goal intent over the existing proof graph. This is a pure
 * projection of one session; it never scans the repository or writes state.
 */
export function projectGoalCoverage(session: ChangeSession): GoalCoverageGraph {
  const contract = session.goalContract;
  if (!contract) return { nodes: [], edges: [], gaps: [] };

  const nodes: GoalNode[] = [];
  const edges: GoalEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  const gaps: { criterionId: string; missing: string }[] = [];

  const addNode = (node: GoalNode): void => {
    if (nodeIds.has(node.id)) return;
    if (nodes.length >= MAX_NODES) throw new Error("Goal coverage graph exceeds its node cap.");
    nodeIds.add(node.id);
    nodes.push(node);
  };
  const addEdge = (
    from: string,
    to: string,
    kind: GoalEdge["kind"],
    observedRevision = session.current.id,
  ): void => {
    if (!nodeIds.has(from) || !nodeIds.has(to))
      throw new Error("Goal coverage edge references an unknown node.");
    const key = `${from}|${to}|${kind}`;
    if (edgeKeys.has(key)) return;
    if (edges.length >= MAX_EDGES) throw new Error("Goal coverage graph exceeds its edge cap.");
    edgeKeys.add(key);
    edges.push({ from, to, kind, observedRevision });
  };

  const outcomes = new Map(contract.desiredOutcomes.map((outcome) => [outcome.id, outcome]));
  const criteria = new Map(contract.criteria.map((criterion) => [criterion.id, criterion]));

  // Pass 1: all nodes, so edge validation never depends on declaration order.
  addNode({ id: contract.id, kind: "Goal", version: contract.version });
  for (const outcome of contract.desiredOutcomes)
    addNode({ id: outcome.id, kind: "DesiredOutcome" });
  for (const criterion of contract.criteria) {
    addNode({ id: criterion.id, kind: "AcceptanceCriterion", version: criterion.version });
    for (const obligationId of criterion.obligationIds) {
      const obligation = session.nodes.find((node) => node.id === obligationId);
      if (!obligation) throw new Error("Goal criterion references an unknown proof obligation.");
      addNode({ id: obligation.id, kind: "ProofObligation", version: obligation.version });
      for (const evidence of session.evidence) {
        if (evidence.nodeId !== obligation.id) continue;
        addNode({ id: evidence.id, kind: "Evidence" });
      }
    }
  }
  for (const preserve of contract.preserveContracts) {
    addNode({ id: preserve.id, kind: "PreserveContract" });
    addNode({ id: `artifact:${preserve.artifact}`, kind: "RepositoryArtifact" });
  }
  for (const forbidden of contract.forbiddenOutcomes)
    addNode({ id: forbidden.id, kind: "ForbiddenOutcome" });
  for (const nonGoal of contract.nonGoals) addNode({ id: nonGoal.id, kind: "NonGoal" });
  for (const decision of contract.openDecisions) addNode({ id: decision.id, kind: "OpenDecision" });

  // Pass 2: edges over the complete node set.
  for (const outcome of contract.desiredOutcomes) {
    addEdge(contract.id, outcome.id, "requires");
    for (const criterionId of outcome.criterionIds) {
      if (!criteria.has(criterionId))
        throw new Error("Goal outcome references an unknown criterion.");
      addEdge(outcome.id, criterionId, "requires");
    }
  }
  for (const criterion of contract.criteria) {
    for (const outcomeId of criterion.outcomeIds)
      if (!outcomes.has(outcomeId))
        throw new Error("Goal criterion references an unknown outcome.");
    for (const obligationId of criterion.obligationIds) {
      addEdge(criterion.id, obligationId, "verified_by");
      for (const evidence of session.evidence) {
        if (evidence.nodeId !== obligationId) continue;
        addEdge(obligationId, evidence.id, "evidenced_by", evidence.observedRevision);
      }
    }
    if (criterion.obligationIds.length === 0)
      gaps.push({
        criterionId: criterion.id,
        missing: "No linked proof obligation.",
      });
  }
  for (const preserve of contract.preserveContracts) {
    addEdge(contract.id, preserve.id, "preserves");
    addEdge(preserve.id, `artifact:${preserve.artifact}`, "affects");
  }
  for (const forbidden of contract.forbiddenOutcomes) addEdge(contract.id, forbidden.id, "forbids");
  for (const nonGoal of contract.nonGoals) addEdge(contract.id, nonGoal.id, "excludes");
  for (const decision of contract.openDecisions) {
    addEdge(contract.id, decision.id, "decides");
    for (const blocked of decision.blocks) {
      if (!nodeIds.has(blocked)) throw new Error("Open decision references an unknown goal item.");
      addEdge(decision.id, blocked, "decides");
    }
  }

  return { nodes, edges, gaps };
}
