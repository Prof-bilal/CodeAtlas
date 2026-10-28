import type { GoalContract, GoalContractDraft } from "@prof-bilal/atlas-core";

type PortableDetectorKind = "text-present" | "artifact-exists" | "symbol-exists";

function isPortableDetector(kind: string): kind is PortableDetectorKind {
  return kind === "text-present" || kind === "artifact-exists" || kind === "symbol-exists";
}

/**
 * Convert an adopted contract into unadopted intent for portable import.
 *
 * IDs, adoption timestamps, obligation links and detectors that are not
 * portable are discarded. The result is a draft: it can be reviewed and
 * re-adopted locally, but it can never authorise a goal status by itself.
 */
export function contractToDraft(contract: GoalContract): GoalContractDraft {
  const outcomeKeys = new Map(contract.desiredOutcomes.map((outcome) => [outcome.id, outcome.key]));
  const criterionKeys = new Map(
    contract.criteria.map((criterion) => [criterion.id, criterion.key]),
  );
  const asKey = (id: string, keys: ReadonlyMap<string, string>): string => keys.get(id) ?? id;

  const portableForbidden = contract.forbiddenOutcomes.filter((forbidden) =>
    isPortableDetector(forbidden.detector.kind as string),
  );
  const limitations = [
    "Imported goal intent is unadopted; review and re-adopt it locally before relying on a goal status.",
  ];
  if (portableForbidden.length !== contract.forbiddenOutcomes.length)
    limitations.push(
      "Some forbidden-outcome detectors were not portable and were omitted; re-declare them locally.",
    );

  return {
    schemaVersion: 1,
    goal: contract.goal,
    desiredOutcomes: contract.desiredOutcomes.map((outcome) => ({
      key: outcome.key,
      statement: outcome.statement,
      priority: outcome.priority,
      criterionKeys: outcome.criterionIds.map((id) => asKey(id, criterionKeys)),
    })),
    criteria: contract.criteria.map((criterion) => ({
      key: criterion.key,
      statement: criterion.statement,
      assertion: criterion.assertion,
      outcomeKeys: criterion.outcomeIds.map((id) => asKey(id, outcomeKeys)),
      ...(criterion.dependsOn.length
        ? { dependsOn: criterion.dependsOn.map((id) => asKey(id, criterionKeys)) }
        : {}),
      ...(criterion.evidenceKinds.length ? { evidenceKinds: criterion.evidenceKinds } : {}),
    })),
    preserveCandidates: contract.preserveContracts.map((preserve) => ({
      artifact: preserve.artifact,
      contractId: preserve.contractId,
      name: preserve.name,
    })),
    forbiddenCandidates: portableForbidden.map((forbidden) => ({
      statement: forbidden.statement,
      detectorKind: forbidden.detector.kind as PortableDetectorKind,
      target: forbidden.detector.target,
      paths: forbidden.detector.paths,
    })),
    nonGoals: contract.nonGoals.map((nonGoal) => ({
      statement: nonGoal.statement,
      reason: nonGoal.reason,
      paths: nonGoal.paths,
    })),
    openQuestions: contract.openDecisions
      .filter((decision) => decision.status === "open")
      .map((decision) => ({
        question: decision.question,
        options: decision.options,
        blocks: decision.blocks
          .map((id) => criterionKeys.get(id) ?? outcomeKeys.get(id))
          .filter((key): key is string => key !== undefined),
      })),

    limitations,
  };
}
