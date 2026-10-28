import { createHash, randomBytes } from "node:crypto";
import type {
  AdoptGoalInput,
  BeginChangeInput,
  ChangeSession,
  CriterionAssertion,
  DesiredOutcomePriority,
  GoalContract,
  GoalContractDraft,
  GoalPort,
  GoalSatisfactionReceipt,
  MutationJustification,
  OutcomeEvidenceKind,
  PortableChangeState,
  ProofLevel,
  ProofNode,
  ProofPort,
  ProofProposal,
  ProofRepositoryPort,
  ProofSeverity,
  ProofStorePort,
} from "@prof-bilal/atlas-core";
import { parseGoalDraft } from "./goal-compiler";
import { contractToDraft } from "./goal-import";
import { evaluateGoalSatisfaction, goalObligationNodes, outcomeKindForAction } from "./goal-truth";
import { ASSERTIONS, EVIDENCE_KINDS, LEVELS, PRIORITIES, SEVERITIES } from "./goal-vocabulary";
import { scopes } from "./scopes";
import { evaluateProof, invalidateEvidence } from "./truth";

const PROOF_NODE_KINDS = [
  "Requirement",
  "Constraint",
  "Invariant",
  "Claim",
  "Assumption",
  "Unknown",
  "ProofObligation",
] as const;

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Validate adopted goal intent before it is persisted. This is structural
 * validation only: it does not evaluate criteria, evidence or status.
 */
function validateGoalContract(contract: GoalContract): GoalContract {
  if (contract.schemaVersion !== 1) throw new Error("Unsupported goal contract schema.");
  if (!contract.id || contract.id.length > 128) throw new Error("Invalid goal contract id.");
  if (!contract.goal?.trim() || contract.goal.length > 10000)
    throw new Error("A bounded goal contract is required.");
  if (!Number.isSafeInteger(contract.version) || contract.version < 1)
    throw new Error("Invalid goal contract version.");
  if (
    contract.desiredOutcomes.length > 128 ||
    contract.criteria.length > 64 ||
    contract.preserveContracts.length > 64 ||
    contract.forbiddenOutcomes.length > 64 ||
    contract.nonGoals.length > 64 ||
    contract.openDecisions.length > 32
  )
    throw new Error("Goal contract limit exceeded.");

  const outcomeIds = new Set<string>();
  for (const outcome of contract.desiredOutcomes) {
    if (
      !outcome.id ||
      outcomeIds.has(outcome.id) ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(outcome.key) ||
      !outcome.statement?.trim() ||
      outcome.statement.length > 10000 ||
      !PRIORITIES.includes(outcome.priority)
    )
      throw new Error("Invalid goal outcome.");
    outcomeIds.add(outcome.id);
  }

  const criterionIds = new Set(contract.criteria.map((criterion) => criterion.id));
  if (criterionIds.size !== contract.criteria.length)
    throw new Error("Duplicate criterion identity.");
  for (const outcome of contract.desiredOutcomes)
    if (
      outcome.criterionIds.length > 64 ||
      outcome.criterionIds.some((id) => !criterionIds.has(id))
    )
      throw new Error("Invalid goal outcome criterion links.");
  for (const criterion of contract.criteria) {
    if (
      !criterion.id ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(criterion.key) ||
      !criterion.statement?.trim() ||
      criterion.statement.length > 10000 ||
      !ASSERTIONS.includes(criterion.assertion) ||
      !SEVERITIES.includes(criterion.severity) ||
      !LEVELS.includes(criterion.requiredLevel) ||
      !Number.isSafeInteger(criterion.version) ||
      criterion.version < 1 ||
      criterion.outcomeIds.length > 128 ||
      criterion.outcomeIds.some((id) => !outcomeIds.has(id)) ||
      criterion.dependsOn.length > 32 ||
      criterion.dependsOn.some((id) => !criterionIds.has(id)) ||
      criterion.evidenceKinds.length > 10 ||
      criterion.evidenceKinds.some((kind) => !EVIDENCE_KINDS.includes(kind)) ||
      criterion.obligationIds.length > 128 ||
      criterion.obligationIds.some((id) => typeof id !== "string" || id.length > 128)
    )
      throw new Error("Invalid acceptance criterion.");
  }
  const byId = new Map(contract.criteria.map((criterion) => [criterion.id, criterion]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): void => {
    if (visiting.has(id)) throw new Error("Goal criterion dependencies must be acyclic.");
    if (visited.has(id)) return;
    const criterion = byId.get(id);
    if (!criterion) throw new Error("Unknown goal criterion dependency.");
    visiting.add(id);
    for (const dependency of criterion.dependsOn) walk(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const criterion of contract.criteria) walk(criterion.id);

  const preserveIds = new Set<string>();
  for (const preserve of contract.preserveContracts) {
    if (
      !preserve.id ||
      preserveIds.has(preserve.id) ||
      !preserve.contractId ||
      preserve.contractId.length > 1000 ||
      !preserve.name?.trim() ||
      preserve.name.length > 1000 ||
      typeof preserve.baselineHash !== "string" ||
      !SEVERITIES.includes(preserve.severity) ||
      preserve.obligationIds.length > 8 ||
      preserve.obligationIds.some((id) => typeof id !== "string" || id.length > 128)
    )
      throw new Error("Invalid preserve contract.");
    scopes([preserve.artifact]);
    preserveIds.add(preserve.id);
  }

  const forbiddenIds = new Set<string>();
  for (const forbidden of contract.forbiddenOutcomes) {
    if (
      !forbidden.id ||
      forbiddenIds.has(forbidden.id) ||
      !forbidden.statement?.trim() ||
      forbidden.statement.length > 10000 ||
      !forbidden.detector.target ||
      forbidden.detector.target.length > 1000 ||
      !["text-present", "artifact-exists", "symbol-exists"].includes(forbidden.detector.kind) ||
      forbidden.detector.paths.length === 0 ||
      forbidden.detector.paths.length > 64 ||
      !SEVERITIES.includes(forbidden.severity)
    )
      throw new Error("Invalid forbidden outcome.");
    scopes(forbidden.detector.paths);
    forbiddenIds.add(forbidden.id);
  }

  const nonGoalIds = new Set<string>();
  for (const nonGoal of contract.nonGoals) {
    if (
      !nonGoal.id ||
      nonGoalIds.has(nonGoal.id) ||
      !nonGoal.statement?.trim() ||
      nonGoal.statement.length > 10000 ||
      !nonGoal.reason?.trim() ||
      nonGoal.reason.length > 1000 ||
      nonGoal.paths.length === 0 ||
      nonGoal.paths.length > 64
    )
      throw new Error("Invalid non-goal.");
    scopes(nonGoal.paths);
    nonGoalIds.add(nonGoal.id);
  }

  const decisionIds = new Set<string>();
  for (const decision of contract.openDecisions) {
    if (
      !decision.id ||
      decisionIds.has(decision.id) ||
      !decision.question?.trim() ||
      decision.question.length > 10000 ||
      decision.options.length < 2 ||
      decision.options.length > 16 ||
      !["open", "decided", "deferred"].includes(decision.status) ||
      decision.blocks.length > 32 ||
      decision.blocks.some((id) => !criterionIds.has(id) && !outcomeIds.has(id))
    )
      throw new Error("Invalid open decision.");
    decisionIds.add(decision.id);
  }

  scopes(contract.boundary);
  scopes(contract.authorizedPaths);
  return contract;
}

function criterionSeverity(priorities: readonly DesiredOutcomePriority[]): ProofSeverity {
  if (priorities.includes("MUST")) return "CRITICAL";
  if (priorities.includes("SHOULD")) return "HIGH";
  return "LOW";
}

function criterionLevel(assertion: CriterionAssertion): ProofLevel {
  switch (assertion) {
    case "runtime-behavior":
      return 5;
    case "test-suite-passes":
      return 3;
    case "build-succeeds":
    case "type-sound":
      return 2;
    case "review-only":
      return 0;
    default:
      return 1;
  }
}

function criterionEvidence(assertion: CriterionAssertion): readonly OutcomeEvidenceKind[] {
  switch (assertion) {
    case "artifact-presence":
      return ["artifact-exists"];
    case "literal-presence":
      return ["text-present"];
    case "literal-absence":
      return ["text-absent"];
    case "symbol-presence":
      return ["symbol-exists"];
    case "contract-unchanged":
      return ["contract-unchanged"];
    case "type-sound":
      return ["type-check"];
    case "build-succeeds":
      return ["build"];
    case "test-suite-passes":
      return ["test"];
    case "runtime-behavior":
      return ["runtime-probe"];
    case "review-only":
      return ["manual-review"];
  }
}

function compileGoalContract(
  session: ChangeSession,
  draft: GoalContractDraft,
  input: AdoptGoalInput,
): GoalContract {
  if (!input.approved) throw new Error("Goal adoption requires explicit approval.");
  if (input.goalPolicyVersion !== undefined && input.goalPolicyVersion !== 1)
    throw new Error("Unsupported goal policy version.");
  const outcomeKeys = new Set(draft.desiredOutcomes.map((outcome) => outcome.key));
  const criterionKeys = new Set(draft.criteria.map((criterion) => criterion.key));
  const selectedOutcomeKeys = [
    ...new Set(input.outcomeKeys ?? draft.desiredOutcomes.map((outcome) => outcome.key)),
  ];
  const selectedCriterionKeys = [...new Set(input.criterionKeys)];
  if (!selectedOutcomeKeys.length || !selectedCriterionKeys.length)
    throw new Error("Goal adoption needs at least one outcome and criterion.");
  for (const key of selectedOutcomeKeys)
    if (!outcomeKeys.has(key)) throw new Error("Adopted outcome is not in the staged draft.");
  for (const key of selectedCriterionKeys)
    if (!criterionKeys.has(key)) throw new Error("Adopted criterion is not in the staged draft.");

  const selectedOutcomes = draft.desiredOutcomes.filter((outcome) =>
    selectedOutcomeKeys.includes(outcome.key),
  );
  const selectedCriteria = draft.criteria.filter((criterion) =>
    selectedCriterionKeys.includes(criterion.key),
  );
  const outcomeIds = new Map(
    selectedOutcomes.map((outcome) => [
      outcome.key,
      digest([session.id, "goal-outcome", outcome.key]),
    ]),
  );
  const criterionIds = new Map(
    selectedCriteria.map((criterion) => [
      criterion.key,
      digest([session.id, "goal-criterion", criterion.key]),
    ]),
  );
  const requireId = (ids: ReadonlyMap<string, string>, key: string): string => {
    const id = ids.get(key);
    if (!id) throw new Error("Adopted goal item is missing an identity.");
    return id;
  };
  const criteriaForOutcome = (outcomeKey: string) =>
    selectedCriteria.filter((criterion) => {
      const outcome = selectedOutcomes.find((item) => item.key === outcomeKey);
      return outcome?.criterionKeys.includes(criterion.key) === true;
    });
  const outcomesForCriterion = (criterionKey: string) =>
    selectedOutcomes.filter((outcome) => {
      const criterion = selectedCriteria.find((item) => item.key === criterionKey);
      return criterion?.outcomeKeys.includes(outcome.key) === true;
    });

  for (const outcome of selectedOutcomes)
    if (!criteriaForOutcome(outcome.key).length)
      throw new Error("Every adopted outcome needs a selected criterion.");
  for (const criterion of selectedCriteria) {
    if (!outcomesForCriterion(criterion.key).length)
      throw new Error("Every adopted criterion needs a selected outcome.");
    for (const dependency of criterion.dependsOn ?? []) {
      if (!criterionKeys.has(dependency))
        throw new Error("Adopted criterion references an unknown dependency.");
      if (!selectedCriterionKeys.includes(dependency))
        throw new Error("Adopted criterion depends on an unselected criterion.");
    }
  }
  const selectedDepends = new Map(
    selectedCriteria.map((criterion) => [
      criterion.key,
      (criterion.dependsOn ?? []).filter((key) => selectedCriterionKeys.includes(key)),
    ]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (key: string): void => {
    if (visiting.has(key)) throw new Error("Goal criterion dependencies must be acyclic.");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of selectedDepends.get(key) ?? []) walk(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of selectedDepends.keys()) walk(key);

  const previous = session.goalContract;
  const nextVersion = (previous?.version ?? 0) + 1;
  const existingNodeIds = new Set(session.nodes.map((node) => node.id));
  const linkedObligations = (key: string): readonly string[] => {
    const linked = new Set<string>();
    for (const kind of PROOF_NODE_KINDS) {
      const id = digest([session.id, kind, key]);
      if (existingNodeIds.has(id)) linked.add(id);
    }
    return [...linked].sort();
  };
  const preserveContracts = draft.preserveCandidates.map((candidate, index) => {
    const artifact = session.baseline.artifacts.find((item) => item.path === candidate.artifact);
    if (!artifact) throw new Error("Preserve candidate artifact is not observed in the baseline.");
    const matches = (artifact.contracts ?? []).filter((item) =>
      candidate.contractId ? item.id === candidate.contractId : item.name === candidate.name,
    );
    if (!matches.length)
      throw new Error("Preserve candidate contract is not observed in the baseline.");
    if (matches.length > 1 && !candidate.contractId)
      throw new Error("Preserve candidate contract name is ambiguous; supply a contract id.");
    const matched = matches[0];
    if (!matched) throw new Error("Preserve candidate contract is not observed in the baseline.");
    const preserveId = digest([session.id, "goal-preserve", index, candidate.artifact, matched.id]);
    return {
      id: preserveId,
      artifact: candidate.artifact,
      contractId: matched.id,
      name: matched.name,
      baselineHash: matched.hash,
      severity: "CRITICAL" as const,
      provenance: "model-proposed" as const,
      obligationIds: [
        digest([session.id, "goal-preserve-obligation", preserveId]),
      ] as readonly string[],
    };
  });

  const forbiddenOutcomes = draft.forbiddenCandidates.map((candidate, index) => {
    if (!["text-present", "artifact-exists", "symbol-exists"].includes(candidate.detectorKind))
      throw new Error("Forbidden detector is not supported by this goal policy.");
    const forbiddenId = digest([session.id, "goal-forbidden", index, candidate.statement]);
    return {
      id: forbiddenId,
      statement: candidate.statement,
      detector: {
        kind: candidate.detectorKind,
        paths: candidate.paths,
        target: candidate.target,
      },
      severity: "CRITICAL" as const,
      provenance: "model-proposed" as const,
      obligationId: digest([session.id, "goal-forbidden-obligation", forbiddenId]),
    };
  });

  const decisions = new Map<string, string>();
  for (const decision of input.decisions ?? []) {
    if (
      !decision ||
      typeof decision.key !== "string" ||
      !draft.openQuestions.some((question) => question.question === decision.key) ||
      decisions.has(decision.key) ||
      typeof decision.reason !== "string" ||
      !decision.reason.trim() ||
      decision.reason.length > 1000
    )
      throw new Error("Goal decisions need known open questions and bounded reasons.");
    decisions.set(decision.key, decision.reason);
  }
  const openDecisions = draft.openQuestions.map((question, index) => {
    const decision = decisions.get(question.question);
    const blocks = question.blocks.map((key) => {
      const id = criterionIds.get(key) ?? outcomeIds.get(key);
      if (!id) throw new Error("Open question blocks an unselected goal item.");
      return id;
    });
    return {
      id: digest([session.id, "goal-decision", index, question.question]),
      question: question.question,
      options: question.options,
      status: decision ? ("decided" as const) : ("open" as const),
      blocking: blocks.length > 0,
      blocks,
      ...(decision
        ? {
            decision,
            decidedBy: "user",
            decidedAtRevision: session.current.id,
          }
        : {}),
    };
  });

  const contract: GoalContract = {
    schemaVersion: 1,
    id: digest([session.id, "goal-contract", nextVersion]),
    version: nextVersion,
    goal: draft.goal,
    desiredOutcomes: selectedOutcomes.map((outcome) => ({
      id: requireId(outcomeIds, outcome.key),
      key: outcome.key,
      statement: outcome.statement,
      priority: outcome.priority,
      criterionIds: criteriaForOutcome(outcome.key).map((criterion) =>
        requireId(criterionIds, criterion.key),
      ),
      provenance: "model-proposed",
    })),
    criteria: selectedCriteria.map((criterion) => {
      const previousCriterion = previous?.criteria.find((item) => item.key === criterion.key);
      const outcomes = outcomesForCriterion(criterion.key);
      const previousLinks = (previousCriterion?.obligationIds ?? []).filter((id) =>
        existingNodeIds.has(id),
      );
      const obligationIds = [
        ...new Set([...previousLinks, ...linkedObligations(criterion.key)]),
      ].sort();
      return {
        id: requireId(criterionIds, criterion.key),
        key: criterion.key,
        version: (previousCriterion?.version ?? 0) + 1,
        statement: criterion.statement,
        assertion: criterion.assertion,
        severity: criterionSeverity(outcomes.map((outcome) => outcome.priority)),
        requiredLevel: criterionLevel(criterion.assertion),
        outcomeIds: outcomes.map((outcome) => requireId(outcomeIds, outcome.key)),
        dependsOn: (criterion.dependsOn ?? []).map((key) => requireId(criterionIds, key)),
        provenance: "model-proposed",
        adoptedAtRevision: session.current.id,
        obligationIds,
        evidenceKinds: criterion.evidenceKinds ?? criterionEvidence(criterion.assertion),
      };
    }),
    preserveContracts,
    forbiddenOutcomes,
    nonGoals: draft.nonGoals.map((nonGoal, index) => ({
      id: digest([session.id, "goal-non-goal", index, nonGoal.statement]),
      statement: nonGoal.statement,
      reason: nonGoal.reason,
      paths: nonGoal.paths,
    })),
    openDecisions,
    boundary: session.boundary,
    authorizedPaths: session.authorizedPaths,
    adoptedAtRevision: session.current.id,
    provenance: "mixed",
  };
  return validateGoalContract(contract);
}

function contractContent(contract: GoalContract): string {
  return JSON.stringify({
    goal: contract.goal,
    desiredOutcomes: contract.desiredOutcomes.map((outcome) => ({
      key: outcome.key,
      statement: outcome.statement,
      priority: outcome.priority,
      criterionIds: outcome.criterionIds,
    })),
    criteria: contract.criteria.map((criterion) => ({
      key: criterion.key,
      statement: criterion.statement,
      assertion: criterion.assertion,
      severity: criterion.severity,
      requiredLevel: criterion.requiredLevel,
      outcomeIds: criterion.outcomeIds,
      dependsOn: criterion.dependsOn,
      evidenceKinds: criterion.evidenceKinds,
      obligationIds: criterion.obligationIds,
      limitations: criterion.limitations,
    })),
    preserveContracts: contract.preserveContracts.map((preserve) => ({
      artifact: preserve.artifact,
      contractId: preserve.contractId,
      name: preserve.name,
      baselineHash: preserve.baselineHash,
      severity: preserve.severity,
    })),
    forbiddenOutcomes: contract.forbiddenOutcomes.map((forbidden) => ({
      statement: forbidden.statement,
      detector: forbidden.detector,
      severity: forbidden.severity,
    })),
    nonGoals: contract.nonGoals.map((nonGoal) => ({
      statement: nonGoal.statement,
      reason: nonGoal.reason,
      paths: nonGoal.paths,
    })),
    openDecisions: contract.openDecisions.map((decision) => ({
      question: decision.question,
      options: decision.options,
      status: decision.status,
      blocking: decision.blocking,
      blocks: decision.blocks,
      decision: decision.decision,
    })),
    boundary: contract.boundary,
    authorizedPaths: contract.authorizedPaths,
  });
}

function compile(session: ChangeSession, proposals: readonly ProofProposal[]): ProofNode[] {
  if (proposals.length > 128) throw new Error("Proof node limit exceeded.");
  const ids = new Map(proposals.map((p) => [p.key, digest([session.id, p.kind, p.key])]));
  if (ids.size !== proposals.length) throw new Error("Duplicate proposal keys.");
  const kinds = [
    "Requirement",
    "Constraint",
    "Invariant",
    "Claim",
    "Assumption",
    "Unknown",
    "ProofObligation",
  ];
  const nodes: ProofNode[] = proposals.map((p) => {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(p.key) ||
      !kinds.includes(p.kind) ||
      !p.statement?.trim() ||
      p.statement.length > 10000
    )
      throw new Error("Invalid proof proposal.");
    const level = p.minimumLevel ?? (p.kind === "Requirement" ? 3 : 1);
    if (
      ![0, 1, 2, 3, 4, 5].includes(level) ||
      !["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(p.severity ?? "HIGH")
    )
      throw new Error("Invalid proof policy.");
    if (
      p.action &&
      (![
        "artifact-exists",
        "text-absent",
        "text-present",
        "symbol-exists",
        "command",
        "runtime-probe",
        "public-contract-unchanged",
      ].includes(p.action.kind) ||
        !p.action.target ||
        p.action.target.length > 1000)
    )
      throw new Error("Invalid verification action.");
    const id = ids.get(p.key);
    if (!id) throw new Error("Invalid proof proposal.");
    const previous = session.nodes.find((n) => n.id === id);
    const severityRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    if (
      previous &&
      ((p.minimumLevel !== undefined && level < previous.minimumLevel) ||
        (p.severity !== undefined && severityRank[p.severity] > severityRank[previous.severity]))
    )
      throw new Error("Proposal replacement cannot weaken established proof policy.");
    return {
      id,
      version: (previous?.version ?? 0) + 1,
      kind: p.kind,
      statement: p.statement.trim(),
      severity: p.severity ?? previous?.severity ?? "HIGH",
      minimumLevel: p.minimumLevel ?? previous?.minimumLevel ?? level,
      dependsOn: (p.dependsOn ?? []).map((key) => ids.get(key) ?? key),
      provenance: p.provenance ?? "model-proposed",
      action: p.action
        ? { ...p.action, paths: scopes(p.action.paths.length ? p.action.paths : ["."]) }
        : null,
    };
  });
  const replaced = new Set(nodes.map((n) => n.id));
  const merged = [...session.nodes.filter((n) => !replaced.has(n.id)), ...nodes];
  if (merged.length > 1024) throw new Error("Proof node limit exceeded.");
  const byId = new Map(merged.map((n) => [n.id, n]));
  if (byId.size !== merged.length)
    throw new Error("Proof node already exists; revise it explicitly.");
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): void => {
    if (visiting.has(id)) throw new Error("Proof dependencies must be acyclic.");
    if (visited.has(id)) return;
    const n = byId.get(id);
    if (!n) throw new Error("Unknown proof dependency.");
    visiting.add(id);
    for (const dep of n.dependsOn) walk(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const n of merged) walk(n.id);
  return merged;
}
function validateJustifications(
  session: ChangeSession,
  items: readonly MutationJustification[],
): MutationJustification[] {
  if (!Array.isArray(items) || items.length > 128)
    throw new Error("Mutation authorization limit exceeded.");
  return items.map((item) => {
    const node = session.nodes.find((n) => n.id === item.nodeId);
    if (
      !node ||
      !["Requirement", "Constraint", "Invariant", "Claim"].includes(node.kind) ||
      !item.reason?.trim() ||
      item.reason.length > 1000 ||
      !["requirement", "constraint", "invariant", "bug", "refactor", "dependency"].includes(
        item.kind,
      )
    )
      throw new Error("Invalid mutation justification.");
    return { ...item, paths: scopes(item.paths) };
  });
}

/** All repository IO and execution come through injected ports, never model verdicts. */
export function createProofEngine(
  store: ProofStorePort,
  repository: ProofRepositoryPort,
): ProofPort & GoalPort {
  const load = (id: string): ChangeSession => {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Invalid change id.");
    const session = store.get(id);
    if (!session) throw new Error("Change session not found.");
    return session;
  };
  const save = (session: ChangeSession, patch: Partial<ChangeSession>): ChangeSession => {
    const next = { ...session, ...patch, version: session.version + 1 };
    store.put(next, session.version);
    return next;
  };
  const clearProposedGoal = (session: ChangeSession): ChangeSession => {
    const { proposedGoal, ...next } = session;
    void proposedGoal;
    return next;
  };
  const observe = async (session: ChangeSession): Promise<ChangeSession> => {
    const current = await repository.observe();
    if (current.repositoryId !== session.repositoryId)
      throw new Error("Repository identity mismatch.");
    const evidence = invalidateEvidence(session, current);
    const draft = { ...session, current, evidence };
    const report = evaluateProof(draft);
    const blocked = !current.complete;
    return save(session, {
      current,
      evidence,
      state: blocked
        ? "BLOCKED"
        : report.debt.some((d) => d.severity === "CRITICAL" || d.severity === "HIGH")
          ? "NOT_PROVEN"
          : session.state === "PROVEN"
            ? "PROVEN"
            : "VERIFYING",
    });
  };
  const api: ProofPort & GoalPort = {
    async begin(input: BeginChangeInput) {
      if (!input.goal?.trim() || input.goal.length > 10000)
        throw new Error("A bounded goal is required.");
      const current = await repository.observe();
      const budget = input.semanticChangeBudget ?? 20;
      if (!Number.isSafeInteger(budget) || budget < 0 || budget > 10000)
        throw new Error("Invalid change budget.");
      let session: ChangeSession = {
        schemaVersion: 1,
        id: randomBytes(16).toString("hex"),
        version: 1,
        goal: input.goal.trim(),
        repositoryId: current.repositoryId,
        baseline: current,
        current,
        boundary: scopes(input.boundary ?? ["."]),
        authorizedPaths: scopes(input.authorizedPaths ?? []),
        semanticChangeBudget: budget,
        state: current.complete ? "INVESTIGATING" : "BLOCKED",
        nodes: [],
        evidence: [],
        receipts: [],
        ...(input.goalContract ? { goalContract: validateGoalContract(input.goalContract) } : {}),
        ...(input.proposedGoal ? { proposedGoal: parseGoalDraft(input.proposedGoal) } : {}),
      };
      session = {
        ...session,
        nodes: compile(
          session,
          input.proposals?.length
            ? input.proposals
            : [
                {
                  key: "goal",
                  kind: "Requirement",
                  statement: session.goal,
                  severity: "CRITICAL",
                  provenance: "user",
                  minimumLevel: 3,
                },
              ],
        ),
      };
      if (session.goalContract)
        session = {
          ...session,
          nodes: [...session.nodes, ...goalObligationNodes(session, session.goalContract)],
        };
      const rules = input.investigationRules ?? [];
      const justifications = input.justifications ?? [];
      if (rules.length > 64 || justifications.length > 128)
        throw new Error("Investigation/authorization limit exceeded.");
      for (const rule of rules) {
        scopes(rule.triggerPaths);
        scopes(rule.expectedPaths);
        if (!rule.reason?.trim() || rule.reason.length > 1000)
          throw new Error("Invalid investigation rule.");
      }
      session = {
        ...session,
        investigationRules: rules,
        justifications: validateJustifications(session, justifications),
      };
      store.put(session, null);
      return evaluateProof(session);
    },
    async understand(id, proposals) {
      const session = await observe(load(id));
      const nodes = compile(session, proposals);
      const changedIntent = nodes.some(
        (n) =>
          ["Requirement", "Constraint", "Invariant"].includes(n.kind) &&
          session.nodes.some((old) => old.id === n.id && old.version !== n.version),
      );
      const evidence = changedIntent
        ? session.evidence.map((e) => ({
            ...e,
            status: "stale" as const,
            validUntilRevision: session.current.id,
            invalidatedBy: [...e.invalidatedBy, "intent-recompiled"],
          }))
        : session.evidence;
      const proposed = (session.proposed ?? []).filter(
        (p) =>
          !proposals.some(
            (accepted) =>
              accepted.key === p.key &&
              accepted.kind === p.kind &&
              accepted.statement === p.statement,
          ),
      );
      return evaluateProof(save(session, { nodes, evidence, proposed, state: "PLANNED" }));
    },
    async revise(id, nodeId, statement) {
      if (!statement.trim() || statement.length > 10000)
        throw new Error("Invalid revised statement.");
      const session = await observe(load(id));
      if (!session.nodes.some((n) => n.id === nodeId)) throw new Error("Unknown proof node.");
      const nodes = session.nodes.map((n) =>
        n.id === nodeId ? { ...n, statement, version: n.version + 1 } : n,
      );
      // Derived obligations may have interpreted the old wording: reopen their checks too.
      const evidence = session.evidence.map((e) => ({
        ...e,
        status: "stale" as const,
        validUntilRevision: session.current.id,
        invalidatedBy: [...e.invalidatedBy, `requirement-revised:${nodeId}`],
      }));
      return evaluateProof(save(session, { nodes, evidence, state: "PLANNED" }));
    },
    async check(id) {
      return evaluateProof(await observe(load(id)));
    },
    async authorize(id, justifications) {
      const session = await observe(load(id));
      return evaluateProof(
        save(session, { justifications: validateJustifications(session, justifications) }),
      );
    },
    async stageProposals(id, proposals) {
      const session = await observe(load(id));
      if (session.proposed?.length)
        throw new Error("Review existing staged proposals before replacing them.");
      compile({ ...session, nodes: [] }, proposals);
      save(session, { proposed: proposals.map((p) => ({ ...p, provenance: "model-proposed" })) });
    },
    async dismissProposals(id, decisions) {
      const session = await observe(load(id));
      if (
        !Array.isArray(decisions) ||
        decisions.length > 32 ||
        decisions.some(
          (d) =>
            !session.proposed?.some((p) => p.key === d.key) ||
            !d.reason?.trim() ||
            d.reason.length > 1000,
        )
      )
        throw new Error("Proposal dismissals need known keys and explicit bounded reasons.");
      const keys = new Set(decisions.map((d) => d.key));
      return evaluateProof(
        save(session, {
          proposed: (session.proposed ?? []).filter((p) => !keys.has(p.key)),
          proposalDecisions: [
            ...(session.proposalDecisions ?? []),
            ...decisions.map((d) => ({ ...d, revision: session.current.id })),
          ].slice(-128),
        }),
      );
    },
    async stageGoalDraft(id, draft) {
      const session = await observe(load(id));
      if (session.proposedGoal)
        throw new Error("Review the existing staged goal draft before replacing it.");
      const parsed = parseGoalDraft(draft);
      save(session, { proposedGoal: parsed, state: "PLANNED" });
    },
    async adoptGoalContract(id, input) {
      if (!input?.approved) throw new Error("Goal adoption requires explicit approval.");
      if (
        !Array.isArray(input.criterionKeys) ||
        input.criterionKeys.length === 0 ||
        input.criterionKeys.length > 64
      )
        throw new Error("Goal adoption needs bounded criterion keys.");
      const session = await observe(load(id));
      if (!session.proposedGoal) throw new Error("No staged goal draft to adopt.");
      const draft = parseGoalDraft(session.proposedGoal);
      const contract = compileGoalContract(session, draft, input);
      const withGoalObligations = (target: ChangeSession): ChangeSession => {
        const generated = goalObligationNodes(target, contract, true);
        const generatedIds = new Set(generated.map((node) => node.id));
        return {
          ...target,
          nodes: [
            ...target.nodes.filter(
              (node) => node.provenance !== "derived" && !generatedIds.has(node.id),
            ),
            ...generated,
          ],
        };
      };
      if (
        session.goalContract &&
        contractContent(session.goalContract) === contractContent(contract)
      )
        return evaluateProof(save(withGoalObligations(clearProposedGoal(session)), {}));
      const evidence = session.evidence.map((item) => ({
        ...item,
        status: "stale" as const,
        validUntilRevision: session.current.id,
        invalidatedBy: [...item.invalidatedBy, "goal-contract-changed"],
      }));
      const next = clearProposedGoal(session);
      const history = [
        ...(session.goalContractHistory ?? []),
        ...(session.goalContract ? [session.goalContract] : []),
      ].slice(-8);
      return evaluateProof(
        save(withGoalObligations(next), {
          goalContract: contract,
          evidence,
          goalContractHistory: history,
          state: "PLANNED",
        }),
      );
    },
    async dismissGoalDraft(id, decisions) {
      if (!Array.isArray(decisions) || decisions.length === 0 || decisions.length > 32)
        throw new Error("Goal dismissals need at least one bounded decision.");
      const session = await observe(load(id));
      if (!session.proposedGoal) throw new Error("No staged goal draft to dismiss.");
      const draft = parseGoalDraft(session.proposedGoal);
      const known = new Set([
        ...draft.criteria.map((criterion) => criterion.key),
        ...draft.desiredOutcomes.map((outcome) => outcome.key),
      ]);
      const seen = new Set<string>();
      for (const decision of decisions) {
        if (
          !decision ||
          typeof decision.key !== "string" ||
          !known.has(decision.key) ||
          seen.has(decision.key) ||
          typeof decision.reason !== "string" ||
          !decision.reason.trim() ||
          decision.reason.length > 1000
        )
          throw new Error("Goal dismissals need known keys and explicit bounded reasons.");
        seen.add(decision.key);
      }
      return evaluateProof(
        save(clearProposedGoal(session), {
          goalProposalDecisions: [
            ...(session.goalProposalDecisions ?? []),
            ...decisions.map((decision) => ({
              key: decision.key,
              reason: decision.reason,
              revision: session.current.id,
            })),
          ].slice(-128),
          state: "PLANNED",
        }),
      );
    },
    async verify(id, nodeId) {
      const before = await observe(load(id));
      const node = before.nodes.find((n) => n.id === nodeId);
      if (!node?.action) throw new Error("Node has no explicit verification action.");
      if (!before.current.complete)
        throw new Error("Cannot verify an incompletely observed repository.");
      const result = await repository.execute(node.action, before.current, before.baseline);
      const current = await repository.observe();
      if (current.repositoryId !== before.repositoryId)
        throw new Error("Repository identity mismatch.");
      const stable = current.complete && current.id === before.current.id;
      const source = before.current.artifacts
        .filter((a) =>
          node.action?.paths.some((p) => p === "." || a.path === p || a.path.startsWith(`${p}/`)),
        )
        .map((a) => a.id);
      const outcomeKind = outcomeKindForAction(node.action, result.level);
      const evidence = {
        id: digest([before.id, node.id, node.version, before.current.id, before.version, result]),
        nodeId,
        nodeVersion: node.version,
        observedRevision: before.current.id,
        validFromRevision: before.current.id,
        validUntilRevision: stable ? null : current.id,
        sourceArtifactIds: source,
        scope: node.action.paths,
        derivation: result.detail.slice(0, 2000),
        level: result.level,
        result: result.result,
        status: stable ? ("fresh" as const) : ("stale" as const),
        invalidatedBy: stable ? [] : ["repository-changed-during-verification"],
        investigatedPaths:
          result.investigatedPaths ??
          (["text-absent", "text-present", "symbol-exists"].includes(node.action.kind)
            ? node.action.paths
            : []),
        criterionIds:
          before.goalContract?.criteria
            .filter((criterion) => criterion.obligationIds.includes(nodeId))
            .map((criterion) => criterion.id)
            .sort() ?? [],
        ...(outcomeKind ? { outcomeKind } : {}),
        ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
      };
      const next = save(before, {
        current,
        evidence: [...invalidateEvidence(before, current), evidence],
        state: stable ? "VERIFYING" : "BLOCKED",
      });
      return evaluateProof(next);
    },
    async prove(id) {
      const session = await observe(load(id));
      const report = evaluateProof(session);
      const goal = report.goal ?? evaluateGoalSatisfaction(session, report);
      const blocked = !session.current.complete;
      const proven =
        session.nodes.some((n) => n.kind === "Requirement") &&
        session.nodes
          .filter((n) => n.kind === "Requirement")
          .every(
            (n) => report.nodes.find((state) => state.nodeId === n.id)?.status === "supported",
          ) &&
        !report.debt.some((d) => d.severity === "CRITICAL" || d.severity === "HIGH");
      const baseId = digest([session.id, session.version, report.nodes, report.debt]);
      const receipt: GoalSatisfactionReceipt = {
        id: digest([
          baseId,
          goal.status,
          goal.contract?.id ?? null,
          goal.criteria,
          goal.intentDebt,
          goal.coverage,
          goal.blockers,
        ]),
        sessionId: session.id,
        baselineRevision: session.baseline.id,
        finalRevision: session.current.id,
        policyVersion: 1,
        completion: blocked ? "blocked" : proven ? "proven" : "not-proven",
        debt: report.debt,
        changedArtifacts: report.changedArtifacts,
        semanticChanges: report.semanticChanges,
        unjustifiedMutations: report.unjustifiedMutations,
        guaranteeCeiling: report.guaranteeCeiling,
        limitations: [
          ...new Set([
            ...session.current.limitations,
            "Proof is limited to explicit obligations and observed repository files; it is not universal correctness.",
            ...goal.limitations,
          ]),
        ],
        receiptKind: "goal-satisfaction",
        goalPolicyVersion: 1,
        goalContractVersion: session.goalContract?.version ?? null,
        goalStatus: goal.status,
        testStatus: goal.testStatus,
        proofStatus: goal.proofStatus,
        intentDebt: goal.intentDebt,
        coverage: goal.coverage,
        satisfiedCriteria: goal.criteria
          .filter((criterion) => criterion.status === "supported")
          .map((criterion) => criterion.criterionId)
          .sort(),
        partialCriteria: goal.criteria
          .filter((criterion) => criterion.status === "partial")
          .map((criterion) => criterion.criterionId)
          .sort(),
        unsatisfiedCriteria: goal.criteria
          .filter((criterion) => criterion.status === "contradicted")
          .map((criterion) => criterion.criterionId)
          .sort(),
        undeterminedCriteria: goal.criteria
          .filter((criterion) => criterion.status === "unknown" || criterion.status === "stale")
          .map((criterion) => criterion.criterionId)
          .sort(),
        blockers: goal.blockers,
      };
      save(session, {
        receipts: [...session.receipts, receipt].slice(-64),
        state: blocked ? "BLOCKED" : proven ? "PROVEN" : "NOT_PROVEN",
      });
      return receipt;
    },
    async exportState(id) {
      const report = await api.check(id);
      return {
        ...report.session,
        exportVersion: 2,
        goalIntentDebt: report.goal?.intentDebt ?? [],
      } as PortableChangeState;
    },
    async importState(state) {
      if (!state || typeof state !== "object" || JSON.stringify(state).length > 8 * 1024 * 1024)
        throw new Error("Invalid portable change state.");
      const input = state as ChangeSession;
      if (input.schemaVersion !== 1 || !Array.isArray(input.nodes) || input.nodes.length > 128)
        throw new Error("Unsupported portable change state.");
      const importedNodes = input.nodes.filter((node) => node.provenance !== "derived");
      const obligationKeys = new Map<string, string>();
      for (const criterion of input.goalContract?.criteria ?? [])
        for (const obligationId of criterion.obligationIds)
          obligationKeys.set(obligationId, criterion.key);
      const keyCounts = new Map<string, number>();
      for (const key of obligationKeys.values()) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      const proposalKeys = new Map<string, string>();
      const usedKeys = new Set<string>();
      importedNodes.forEach((node, index) => {
        const criterionKey = obligationKeys.get(node.id);
        const preferred =
          criterionKey && keyCounts.get(criterionKey) === 1 ? criterionKey : `imported_${index}`;
        let key = preferred;
        let suffix = 1;
        while (usedKeys.has(key)) key = `${preferred}_${suffix++}`;
        usedKeys.add(key);
        proposalKeys.set(node.id, key);
      });
      // Reuse the compiler's validation, assigning fresh IDs and no evidence or receipt state.
      return api.begin({
        goal: input.goal,
        boundary: input.boundary,
        semanticChangeBudget: input.semanticChangeBudget,
        authorizedPaths: [],
        ...(input.goalContract
          ? { proposedGoal: contractToDraft(validateGoalContract(input.goalContract)) }
          : {}),
        proposals: importedNodes.map((n, i) => ({
          key: proposalKeys.get(n.id) ?? `imported_${i}`,
          kind: n.kind,
          statement: n.statement,
          severity: n.severity,
          minimumLevel: n.minimumLevel,
          dependsOn: n.dependsOn.map(
            (id: string) => proposalKeys.get(id) ?? `missing_${id.slice(0, 16)}`,
          ),
          provenance: "model-proposed",
          ...(n.action ? { action: n.action } : {}),
        })),
      });
    },
    close() {
      store.close();
    },
  };
  return api;
}
