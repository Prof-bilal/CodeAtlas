import { createHash } from "node:crypto";
import type {
  AcceptanceCriterion,
  ChangeSession,
  CriterionState,
  DesiredOutcome,
  Evidence,
  EvidenceAdequacy,
  ForbiddenOutcome,
  GoalBlindspot,
  GoalBlocker,
  GoalContract,
  GoalCoverageSummary,
  GoalGuaranteeCeiling,
  GoalSatisfactionReport,
  GoalSatisfactionStatus,
  IntentDebtItem,
  IntentDebtKind,
  IntentDrift,
  OutcomeEvidenceKind,
  PreserveContract,
  ProofLevel,
  ProofNode,
  ProofReport,
  ProofSeverity,
  SpecConflict,
  TestStatusSummary,
  UnintendedOutcome,
  VerificationAction,
} from "@prof-bilal/atlas-core";
import { behavioralDifferential } from "./differential";

const SEVERITY_RANK: Record<ProofSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};
const ASSERTION_STRENGTH: Record<AcceptanceCriterion["assertion"], number> = {
  "review-only": 0,
  "artifact-presence": 1,
  "literal-presence": 1,
  "literal-absence": 1,
  "symbol-presence": 1,
  "contract-unchanged": 2,
  "type-sound": 2,
  "build-succeeds": 2,
  "test-suite-passes": 3,
  "runtime-behavior": 5,
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function inScope(path: string, scopes: readonly string[]): boolean {
  return scopes.some((scope) => scope === "." || path === scope || path.startsWith(`${scope}/`));
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function covers(scope: readonly string[], investigated: readonly string[]): boolean {
  return (
    scope.length > 0 && scope.every((item) => investigated.some((path) => inScope(path, [item])))
  );
}

export function forbiddenObligationId(session: ChangeSession, forbidden: ForbiddenOutcome): string {
  return forbidden.obligationId ?? digest([session.id, "goal-forbidden-obligation", forbidden.id]);
}

/**
 * Materialize the deterministic, read-only obligations that belong to adopted
 * intent. Forbidden detectors and preserve contracts become ordinary proof
 * obligations, so `verify` remains the only execution path.
 */
export function goalObligationNodes(
  session: ChangeSession,
  contract: GoalContract,
  replace = false,
): readonly ProofNode[] {
  const existing = new Set(replace ? [] : session.nodes.map((node) => node.id));
  const nodes: ProofNode[] = [];
  for (const preserve of contract.preserveContracts) {
    const id =
      preserve.obligationIds[0] ?? digest([session.id, "goal-preserve-obligation", preserve.id]);
    if (existing.has(id)) continue;
    nodes.push({
      id,
      version: 1,
      kind: "ProofObligation",
      statement: `Preserve ${preserve.name} on ${preserve.artifact}`,
      severity: preserve.severity,
      minimumLevel: 1,
      dependsOn: [],
      provenance: "derived",
      action: {
        kind: "public-contract-unchanged",
        paths: [preserve.artifact],
        target: preserve.contractId,
      },
    });
  }
  for (const forbidden of contract.forbiddenOutcomes) {
    const id = forbiddenObligationId(session, forbidden);
    if (existing.has(id)) continue;
    nodes.push({
      id,
      version: 1,
      kind: "ProofObligation",
      statement: `Forbidden: ${forbidden.statement}`,
      severity: forbidden.severity,
      minimumLevel: 1,
      dependsOn: [],
      provenance: "derived",
      action: forbidden.detector,
    });
  }
  return nodes;
}

/** The deterministic action→evidence kind projection. Never supplied by a model. */
export function outcomeKindForAction(
  action: VerificationAction | null | undefined,
  level?: ProofLevel,
): OutcomeEvidenceKind | undefined {
  if (!action) return undefined;
  switch (action.kind) {
    case "artifact-exists":
      return "artifact-exists";
    case "text-absent":
      return "text-absent";
    case "text-present":
      return "text-present";
    case "symbol-exists":
      return "symbol-exists";
    case "public-contract-unchanged":
      return "contract-unchanged";
    case "runtime-probe":
      return "runtime-probe";
    case "command":
      if (/type/i.test(action.target)) return "type-check";
      if (/build/i.test(action.target)) return "build";
      return level !== undefined && level <= 2 ? "build" : "test";
  }
}

export interface AdequacyContext {
  /** The criterion's declared scope, normally the linked obligation paths. */
  readonly scope?: readonly string[];
  readonly investigatedPaths?: readonly string[];
  readonly deploymentBound?: boolean;
  readonly languageSupported?: boolean;
}

/**
 * Pure adequacy matrix from RFC §12.2. A missing/unknown evidence kind is never
 * sufficient; `test` can never satisfy `runtime-behavior`.
 */
export function assessAdequacy(
  assertion: AcceptanceCriterion["assertion"],
  outcomeKind: OutcomeEvidenceKind | undefined,
  level: ProofLevel,
  context: AdequacyContext = {},
): EvidenceAdequacy {
  if (!outcomeKind) return "unknown";
  const manual = outcomeKind === "manual-review";
  switch (assertion) {
    case "artifact-presence":
      if (outcomeKind === "artifact-exists") return level >= 1 ? "sufficient" : "partial";
      return manual ? "partial" : "insufficient";
    case "literal-presence":
      if (outcomeKind === "text-present") return level >= 1 ? "sufficient" : "partial";
      return manual ? "partial" : "insufficient";
    case "literal-absence":
      if (outcomeKind === "text-absent")
        return level >= 1 && (context.scope?.length ?? 0) > 0 ? "sufficient" : "partial";
      return manual ? "partial" : "insufficient";
    case "symbol-presence":
      if (outcomeKind === "symbol-exists")
        return context.languageSupported === false
          ? "unknown"
          : level >= 1
            ? "sufficient"
            : "partial";
      return manual ? "partial" : "insufficient";
    case "contract-unchanged":
      if (outcomeKind === "contract-unchanged") return level >= 1 ? "sufficient" : "partial";
      return manual ? "partial" : "insufficient";
    case "type-sound":
      if (outcomeKind === "type-check") return level >= 2 ? "sufficient" : "partial";
      return "insufficient";
    case "build-succeeds":
      if (outcomeKind === "build") return level >= 2 ? "sufficient" : "partial";
      return "insufficient";
    case "test-suite-passes":
      if (outcomeKind === "test") {
        if (level < 3) return "partial";
        return covers(context.scope ?? [], context.investigatedPaths ?? [])
          ? "sufficient"
          : "partial";
      }
      return manual ? "partial" : "insufficient";
    case "runtime-behavior":
      if (outcomeKind === "runtime-probe")
        return level >= 5 && context.deploymentBound === true ? "sufficient" : "unknown";
      return manual ? "partial" : "insufficient";
    case "review-only":
      return manual ? "partial" : "insufficient";
  }
}

function evidenceKind(
  evidence: Evidence,
  action: VerificationAction | null | undefined,
): OutcomeEvidenceKind | undefined {
  return evidence.outcomeKind ?? outcomeKindForAction(action, evidence.level);
}

function latestEvidence(session: ChangeSession, nodeId: string): Evidence | undefined {
  for (let index = session.evidence.length - 1; index >= 0; index--) {
    const evidence = session.evidence[index];
    if (evidence?.nodeId === nodeId) return evidence;
  }
  return undefined;
}

function forbiddenEvidence(
  session: ChangeSession,
  forbidden: ForbiddenOutcome,
): Evidence | undefined {
  return latestEvidence(session, forbiddenObligationId(session, forbidden));
}

/** Detected means the forbidden detector positively matched. */
function forbiddenDetected(session: ChangeSession, forbidden: ForbiddenOutcome): boolean {
  if (forbidden.detector.kind === "artifact-exists")
    return session.current.artifacts.some(
      (artifact) => artifact.path === forbidden.detector.target,
    );
  const evidence = forbiddenEvidence(session, forbidden);
  return evidence?.status === "fresh" && evidence.result === "pass";
}

function forbiddenClear(session: ChangeSession, forbidden: ForbiddenOutcome): boolean {
  const evidence = forbiddenEvidence(session, forbidden);
  if (evidence?.status === "fresh" && evidence.result === "fail") return true;
  if (forbidden.detector.kind === "artifact-exists")
    return !session.current.artifacts.some(
      (artifact) => artifact.path === forbidden.detector.target,
    );
  return false;
}

function preserveCurrentHash(
  session: ChangeSession,
  preserve: PreserveContract,
): string | undefined {
  return session.current.artifacts
    .find((artifact) => artifact.path === preserve.artifact)
    ?.contracts?.find((contract) => contract.id === preserve.contractId)?.hash;
}

function preserveChanged(session: ChangeSession, preserve: PreserveContract): boolean {
  const artifact = session.current.artifacts.find((item) => item.path === preserve.artifact);
  if (!artifact) return true;
  const current = artifact.contracts?.find((contract) => contract.id === preserve.contractId)?.hash;
  return current !== undefined && current !== preserve.baselineHash;
}

function preserveVerified(session: ChangeSession, preserve: PreserveContract): boolean {
  const current = preserveCurrentHash(session, preserve);
  return current !== undefined && current === preserve.baselineHash;
}

function criterionEvidence(
  session: ChangeSession,
  criterion: AcceptanceCriterion,
): readonly Evidence[] {
  // Only the latest record per node is authoritative. Keeping an older stale
  // or failed record would let history poison a fresh re-verification.
  const latest = new Map<string, Evidence>();
  for (const evidence of session.evidence) {
    if (evidence.criterionIds?.includes(criterion.id)) {
      latest.set(evidence.nodeId, evidence);
      continue;
    }
    if (criterion.obligationIds.includes(evidence.nodeId)) latest.set(evidence.nodeId, evidence);
  }
  return [...latest.values()];
}

function criterionScope(
  criterion: AcceptanceCriterion,
  nodes: ReadonlyMap<string, ProofNode>,
): string[] {
  return [
    ...new Set(
      criterion.obligationIds
        .flatMap((id) => nodes.get(id)?.action?.paths ?? [])
        .filter((path) => path.length > 0),
    ),
  ].sort();
}

function evaluateCriterion(
  session: ChangeSession,
  criterion: AcceptanceCriterion,
  nodes: ReadonlyMap<string, ProofNode>,
): CriterionState {
  const evidence = criterionEvidence(session, criterion);
  const scope = criterionScope(criterion, nodes);
  const languageSupported =
    criterion.assertion !== "symbol-presence" ||
    scope.some((item) =>
      session.current.artifacts.some(
        (artifact) => inScope(artifact.path, [item]) && /\.[cm]?[jt]sx?$/i.test(artifact.path),
      ),
    );
  const must = criterion.outcomeIds.some((id) =>
    session.goalContract?.desiredOutcomes.some(
      (outcome) => outcome.id === id && outcome.priority === "MUST",
    ),
  );
  const reasons: string[] = [];
  let contradiction = false;
  let stale = false;
  let supported = false;
  let partial = false;
  let insufficient = false;
  let known = false;
  let bestLevel: ProofLevel = 0;
  let bestAdequacy: EvidenceAdequacy = "unknown";
  for (const item of evidence) {
    const node = nodes.get(item.nodeId);
    const versionCurrent = !node || item.nodeVersion === node.version;
    const kind = evidenceKind(item, node?.action);
    const adequacy =
      criterion.evidenceKinds.length > 0 && kind && !criterion.evidenceKinds.includes(kind)
        ? "insufficient"
        : assessAdequacy(criterion.assertion, kind, item.level, {
            scope,
            investigatedPaths: item.investigatedPaths ?? [],
            deploymentBound:
              item.outcomeKind === "runtime-probe" &&
              (item.expiresAt !== undefined || item.derivation.toLowerCase().includes("bound")),
            languageSupported,
          });
    if (item.status === "stale" || !versionCurrent) {
      stale = true;
      reasons.push(`Stale evidence: ${item.id}.`);
      continue;
    }
    if (item.result === "fail") {
      contradiction = true;
      reasons.push(`Contradicted by evidence ${item.id}.`);
      continue;
    }
    if (item.result === "unknown") {
      insufficient = true;
      reasons.push(`Unknown evidence: ${item.id}.`);
      continue;
    }
    known = true;
    if (adequacy === "sufficient" && item.level >= criterion.requiredLevel) {
      supported = true;
      bestLevel = Math.max(bestLevel, item.level) as ProofLevel;
      bestAdequacy = "sufficient";
      reasons.push(`Supported by evidence ${item.id}.`);
    } else if (adequacy === "insufficient" || adequacy === "unknown") {
      insufficient = true;
      if (item.level > bestLevel) bestLevel = item.level;
      reasons.push(`Evidence ${item.id} is insufficient for ${criterion.assertion}.`);
    } else if (adequacy === "partial" || item.level < criterion.requiredLevel) {
      partial = true;
      if (item.level > bestLevel) bestLevel = item.level;
      if (bestAdequacy !== "sufficient") bestAdequacy = "partial";
      reasons.push(
        item.level < criterion.requiredLevel
          ? `Evidence ${item.id} is below required level ${criterion.requiredLevel}.`
          : `Evidence ${item.id} only partially covers ${criterion.assertion}.`,
      );
    } else {
      insufficient = true;
      if (item.level > bestLevel) bestLevel = item.level;
      reasons.push(`Evidence ${item.id} is insufficient for ${criterion.assertion}.`);
    }
  }
  // A review-only criterion can never support a MUST outcome.
  if (criterion.assertion === "review-only") {
    supported = false;
    partial = false;
    insufficient = false;
    bestAdequacy = evidence.length ? "partial" : "unknown";
    if (must) reasons.push("Review-only criteria cannot establish goal satisfaction.");
  }
  let status: CriterionState["status"];
  if (contradiction) status = "contradicted";
  else if (stale && !supported) status = "stale";
  else if (supported) status = "supported";
  else if (partial) status = "partial";
  else if (evidence.length === 0 || (!known && insufficient)) status = "unknown";
  else status = "unknown";
  if (status === "unknown" && evidence.length > 0 && !reasons.length)
    reasons.push("No adopted evidence is sufficient for this criterion.");
  return {
    criterionId: criterion.id,
    status,
    level: bestLevel,
    adequacy: bestAdequacy,
    evidenceIds: evidence.map((item) => item.id).sort(),
    reasons,
  };
}

function applyDependencies(
  criteria: readonly AcceptanceCriterion[],
  states: readonly CriterionState[],
): CriterionState[] {
  const base = new Map(states.map((state) => [state.criterionId, state]));
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const resolved = new Map<string, CriterionState>();
  const resolving = new Set<string>();
  const resolve = (id: string): CriterionState | undefined => {
    const done = resolved.get(id);
    if (done) return done;
    const state = base.get(id);
    const criterion = byId.get(id);
    if (!state || !criterion) return state;
    if (resolving.has(id)) return state; // Adoption rejects cycles; fail conservatively if one appears.
    resolving.add(id);
    const dependencies = criterion.dependsOn
      .map((dependencyId) => resolve(dependencyId))
      .filter((dependency): dependency is CriterionState => dependency !== undefined);
    let next = state;
    if (dependencies.some((dependency) => dependency.status === "contradicted"))
      next = {
        ...state,
        status: "contradicted",
        reasons: [...state.reasons, "A dependency is contradicted."],
      };
    else if (dependencies.some((dependency) => dependency.status === "stale"))
      next = {
        ...state,
        status: state.status === "supported" ? "stale" : state.status,
        reasons: [...state.reasons, "A dependency is stale."],
      };
    else if (
      dependencies.some((dependency) => dependency.status === "unknown") &&
      state.status === "supported"
    )
      next = {
        ...state,
        status: "unknown",
        reasons: [...state.reasons, "A dependency is unknown."],
      };
    resolving.delete(id);
    resolved.set(id, next);
    return next;
  };
  return criteria.map(
    (criterion) =>
      resolve(criterion.id) ?? {
        criterionId: criterion.id,
        status: "unknown",
        level: 0,
        adequacy: "unknown",
        evidenceIds: [],
        reasons: [],
      },
  );
}

function deriveTestStatus(session: ChangeSession): TestStatusSummary {
  const commands: TestStatusSummary["commands"][number][] = [];
  const seen = new Set<string>();
  for (const node of session.nodes) {
    if (node.action?.kind !== "command") continue;
    const key = node.action.target;
    if (seen.has(key)) continue;
    const evidence = latestEvidence(session, node.id);
    if (
      !evidence ||
      !Number.isSafeInteger(evidence.level) ||
      evidence.level < 2 ||
      evidence.level > 4
    )
      continue;
    seen.add(key);
    commands.push({
      key,
      level: evidence.level as 2 | 3 | 4,
      result: evidence.result,
      revision: evidence.observedRevision,
      stale: evidence.status === "stale",
    });
  }
  commands.sort((a, b) => a.key.localeCompare(b.key));
  let outcome: TestStatusSummary["outcome"];
  if (!commands.length) outcome = "not-run";
  else if (commands.some((command) => command.stale)) outcome = "stale";
  else if (commands.some((command) => command.result === "fail"))
    outcome = commands.every((command) => command.result === "fail") ? "failing" : "mixed";
  else if (commands.some((command) => command.result === "unknown")) outcome = "mixed";
  else if (commands.every((command) => command.result === "pass")) outcome = "passing";
  else outcome = "mixed";
  return { commands, outcome };
}

function deriveProofStatus(
  session: ChangeSession,
  report: ProofReport,
): GoalSatisfactionReport["proofStatus"] {
  const requirements = session.nodes.filter(
    (node) => node.kind === "Requirement" || node.kind === "Invariant",
  );
  const proven =
    requirements.length > 0 &&
    requirements.every(
      (node) => report.nodes.find((state) => state.nodeId === node.id)?.status === "supported",
    ) &&
    !report.debt.some((debt) => debt.severity === "CRITICAL" || debt.severity === "HIGH");
  return {
    nodes: report.nodes,
    completion: !session.current.complete ? "blocked" : proven ? "proven" : "not-proven",
    ceiling: report.guaranteeCeiling,
    debt: report.debt,
  };
}

function goalOutcomePriority(
  contract: GoalContract,
  criterion: AcceptanceCriterion,
): DesiredOutcome["priority"] | undefined {
  const outcomes = contract.desiredOutcomes.filter((outcome) =>
    criterion.outcomeIds.includes(outcome.id),
  );
  if (outcomes.some((outcome) => outcome.priority === "MUST")) return "MUST";
  if (outcomes.some((outcome) => outcome.priority === "SHOULD")) return "SHOULD";
  if (outcomes.length) return "MAY";
  return undefined;
}

function detectDrifts(
  session: ChangeSession,
  contract: GoalContract,
  report: ProofReport,
): IntentDrift[] {
  const drifts: IntentDrift[] = [];
  const add = (
    kind: IntentDrift["kind"],
    subject: string,
    from: string,
    to: string,
    reason: string,
  ) => {
    const id = digest([subject, kind, reason]);
    if (!drifts.some((drift) => drift.id === id))
      drifts.push({ id, kind, subject, from, to, reason });
  };
  if (session.goal !== contract.goal)
    add(
      "goal-text-diverged",
      session.id,
      contract.goal,
      session.goal,
      "Session goal text diverged from the adopted contract.",
    );
  if (
    !sameList(session.boundary, contract.boundary) &&
    session.boundary.some((path) => !contract.boundary.includes(path))
  )
    add(
      "boundary-expanded",
      session.id,
      contract.boundary.join(","),
      session.boundary.join(","),
      "Session boundary expanded after adoption.",
    );
  if (session.authorizedPaths.some((path) => !contract.authorizedPaths.includes(path)))
    add(
      "authorization-expanded",
      session.id,
      contract.authorizedPaths.join(","),
      session.authorizedPaths.join(","),
      "Authorized paths expanded after adoption.",
    );
  const previous = session.goalContractHistory?.at(-1);
  if (previous) {
    for (const criterion of contract.criteria) {
      const old = previous.criteria.find((item) => item.key === criterion.key);
      if (!old) continue;
      const reasons: string[] = [];
      if (criterion.requiredLevel < old.requiredLevel)
        reasons.push(`required level ${old.requiredLevel}→${criterion.requiredLevel}`);
      if (SEVERITY_RANK[criterion.severity] > SEVERITY_RANK[old.severity])
        reasons.push(`severity ${old.severity}→${criterion.severity}`);
      if (ASSERTION_STRENGTH[criterion.assertion] < ASSERTION_STRENGTH[old.assertion])
        reasons.push(`assertion ${old.assertion}→${criterion.assertion}`);
      const oldMust = old.outcomeIds.filter(
        (id) => previous.desiredOutcomes.find((outcome) => outcome.id === id)?.priority === "MUST",
      );
      if (oldMust.some((id) => !criterion.outcomeIds.includes(id)))
        reasons.push("a MUST outcome mapping was removed");
      if (reasons.length)
        add(
          "criterion-weakened",
          criterion.id,
          `${old.version}:${old.assertion}`,
          `${criterion.version}:${criterion.assertion}`,
          `Criterion ${criterion.key} weakened: ${reasons.join("; ")}.`,
        );
    }
  }
  for (const preserve of contract.preserveContracts)
    if (preserveChanged(session, preserve))
      add(
        "preserve-baseline-changed",
        preserve.id,
        preserve.baselineHash,
        preserveCurrentHash(session, preserve) ?? "absent",
        `Preserve baseline changed for ${preserve.artifact}.`,
      );
  for (const outcome of contract.desiredOutcomes)
    if (outcome.priority === "MUST" && outcome.criterionIds.length === 0)
      add(
        "outcome-unmapped",
        outcome.id,
        "mapped",
        "unmapped",
        `MUST outcome ${outcome.key} has no criterion.`,
      );
  for (const nonGoal of contract.nonGoals)
    for (const path of report.changedArtifacts)
      if (inScope(path, nonGoal.paths))
        add(
          "non-goal-violated",
          nonGoal.id,
          "untouched",
          path,
          `Changed artifact ${path} is inside a non-goal.`,
        );
  if (session.proposedGoal) {
    const adopted = new Set(contract.criteria.map((criterion) => criterion.key));
    for (const criterion of session.proposedGoal.criteria)
      if (
        !adopted.has(criterion.key) &&
        criterion.outcomeKeys.some(
          (key) =>
            session.proposedGoal?.desiredOutcomes.find((outcome) => outcome.key === key)
              ?.priority === "MUST",
        )
      )
        add(
          "criterion-strengthened-unadopted",
          `proposed:${criterion.key}`,
          "unadopted",
          criterion.key,
          "A staged MUST criterion has not been adopted.",
        );
  }
  return drifts;
}

function detectConflicts(
  session: ChangeSession,
  contract: GoalContract,
  nodes: ReadonlyMap<string, ProofNode>,
): SpecConflict[] {
  const conflicts: SpecConflict[] = [];
  const add = (
    kind: SpecConflict["kind"],
    subjects: readonly string[],
    reason: string,
    blocking: boolean,
  ) => {
    const id = digest([kind, subjects, reason]);
    if (!conflicts.some((conflict) => conflict.id === id))
      conflicts.push({ id, kind, subjects, reason, blocking });
  };
  const byObligation = new Map<string, AcceptanceCriterion[]>();
  for (const criterion of contract.criteria) {
    for (const id of criterion.obligationIds) {
      const list = byObligation.get(id) ?? [];
      list.push(criterion);
      byObligation.set(id, list);
    }
    if (criterion.statement.trim().length < 8 && criterion.evidenceKinds.length === 0)
      add(
        "unresolvable-ambiguity",
        [criterion.id],
        `Criterion ${criterion.key} is too ambiguous to evaluate.`,
        true,
      );
  }
  for (const [obligation, criteria] of byObligation) {
    const presence = criteria.some((criterion) => criterion.assertion === "literal-presence");
    const absence = criteria.some((criterion) => criterion.assertion === "literal-absence");
    if (presence && absence)
      add(
        "contradictory-assertions",
        [obligation, ...criteria.map((criterion) => criterion.id)],
        "The same obligation is required to be present and absent.",
        true,
      );
  }
  for (const preserve of contract.preserveContracts) {
    if (
      session.authorizedPaths.some((path) => inScope(preserve.artifact, [path])) &&
      session.current.artifacts.some(
        (artifact) => artifact.path === preserve.artifact && preserveChanged(session, preserve),
      )
    )
      add(
        "preserve-vs-change",
        [preserve.id, preserve.artifact],
        `Preserve contract ${preserve.name} conflicts with an authorized semantic change.`,
        true,
      );
  }
  for (const forbidden of contract.forbiddenOutcomes) {
    const detector = forbidden.detector;
    const required = contract.criteria.find((criterion) =>
      criterion.obligationIds.some((id) => {
        const action = nodes.get(id)?.action;
        return action?.target === detector.target;
      }),
    );
    if (required)
      add(
        "forbidden-vs-required",
        [forbidden.id, required.id],
        `Forbidden target ${detector.target} is also required by criterion ${required.key}.`,
        true,
      );
  }
  for (const nonGoal of contract.nonGoals)
    for (const criterion of contract.criteria) {
      if (
        criterion.obligationIds.some((id) =>
          nodes.get(id)?.action?.paths.some((path) => inScope(path, nonGoal.paths)),
        )
      )
        add(
          "non-goal-vs-boundary",
          [nonGoal.id, criterion.id],
          `Criterion ${criterion.key} requires change inside non-goal ${nonGoal.id}.`,
          false,
        );
    }
  return conflicts;
}

function detectUnintended(
  session: ChangeSession,
  contract: GoalContract,
  report: ProofReport,
): UnintendedOutcome[] {
  const items: UnintendedOutcome[] = [];
  const add = (
    kind: UnintendedOutcome["kind"],
    subject: string,
    reason: string,
    severity: ProofSeverity,
  ) => {
    const id = digest([subject, kind, reason]);
    if (!items.some((item) => item.id === id)) items.push({ id, kind, subject, reason, severity });
  };
  for (const forbidden of contract.forbiddenOutcomes)
    if (forbiddenDetected(session, forbidden))
      add(
        "forbidden-detected",
        forbidden.id,
        `Forbidden outcome detected: ${forbidden.statement}`,
        forbidden.severity,
      );
  for (const preserve of contract.preserveContracts)
    if (preserveChanged(session, preserve))
      add(
        "preserve-changed",
        preserve.id,
        `Preserve contract changed for ${preserve.artifact}.`,
        preserve.severity,
      );
  for (const nonGoal of contract.nonGoals)
    for (const path of report.changedArtifacts)
      if (inScope(path, nonGoal.paths))
        add(
          "non-goal-touched",
          nonGoal.id,
          `Changed artifact ${path} is inside a non-goal.`,
          "HIGH",
        );
  for (const change of report.contractChanges)
    if (
      change.change === "added" &&
      !contract.criteria.some((criterion) =>
        criterion.obligationIds.some((id) =>
          session.nodes
            .find((node) => node.id === id)
            ?.action?.paths.some((path) => inScope(change.artifact, [path])),
        ),
      )
    )
      add(
        "contract-added",
        change.artifact,
        `Unclaimed public contract added in ${change.artifact}.`,
        "MEDIUM",
      );
  return items;
}

function coverageSummary(
  session: ChangeSession,
  contract: GoalContract | null,
  criteria: readonly CriterionState[],
  report: ProofReport,
): GoalCoverageSummary {
  if (!contract)
    return {
      outcomes: { total: 0, must: 0, mapped: 0, unmapped: 0 },
      criteria: { total: 0, supported: 0, partial: 0, contradicted: 0, stale: 0, unknown: 0 },
      preserveContracts: { total: 0, verified: 0, changed: 0, unknown: 0 },
      forbiddenOutcomes: { total: 0, clear: 0, detected: 0, unknown: 0 },
      artifacts: {
        changed: report.changedArtifacts.length,
        covered: 0,
        blindspots: report.blindspots.filter((blindspot) => !blindspot.investigated).length,
      },
      status: "absent",
    };
  const criterionIds = new Set(contract.criteria.map((criterion) => criterion.id));
  const outcomes = contract.desiredOutcomes.map((outcome) => ({
    outcome,
    mapped: outcome.criterionIds.filter((id) => criterionIds.has(id)).length > 0,
  }));
  const states = new Map(criteria.map((state) => [state.criterionId, state]));
  const mustCriteria = contract.criteria.filter(
    (criterion) => goalOutcomePriority(contract, criterion) === "MUST",
  );
  const covered = report.changedArtifacts.filter((path) =>
    contract.criteria.some((criterion) => {
      const state = states.get(criterion.id);
      if (!state) return false;
      return criterion.obligationIds.some((id) => {
        const action = session.nodes.find((node) => node.id === id)?.action;
        return action?.paths.some((scope) => inScope(path, [scope])) ?? false;
      });
    }),
  );
  const blindspots = report.blindspots.filter((blindspot) => !blindspot.investigated);
  const mustOutcomes = outcomes.filter(({ outcome }) => outcome.priority === "MUST");
  const mustState = (state: CriterionState | undefined) =>
    state !== undefined && state.evidenceIds.length > 0;
  const complete =
    mustOutcomes.length > 0 &&
    mustOutcomes.every(({ mapped }) => mapped) &&
    mustCriteria.every((criterion) => mustState(states.get(criterion.id))) &&
    blindspots.length === 0;
  return {
    outcomes: {
      total: outcomes.length,
      must: mustOutcomes.length,
      mapped: outcomes.filter(({ mapped }) => mapped).length,
      unmapped: outcomes.filter(({ mapped }) => !mapped).length,
    },
    criteria: {
      total: criteria.length,
      supported: criteria.filter((state) => state.status === "supported").length,
      partial: criteria.filter((state) => state.status === "partial").length,
      contradicted: criteria.filter((state) => state.status === "contradicted").length,
      stale: criteria.filter((state) => state.status === "stale").length,
      unknown: criteria.filter((state) => state.status === "unknown").length,
    },
    preserveContracts: {
      total: contract.preserveContracts.length,
      verified: contract.preserveContracts.filter((preserve) => preserveVerified(session, preserve))
        .length,
      changed: contract.preserveContracts.filter((preserve) => preserveChanged(session, preserve))
        .length,
      unknown: contract.preserveContracts.filter(
        (preserve) => !preserveVerified(session, preserve) && !preserveChanged(session, preserve),
      ).length,
    },
    forbiddenOutcomes: {
      total: contract.forbiddenOutcomes.length,
      clear: contract.forbiddenOutcomes.filter((forbidden) => forbiddenClear(session, forbidden))
        .length,
      detected: contract.forbiddenOutcomes.filter((forbidden) =>
        forbiddenDetected(session, forbidden),
      ).length,
      unknown: contract.forbiddenOutcomes.filter(
        (forbidden) =>
          !forbiddenClear(session, forbidden) && !forbiddenDetected(session, forbidden),
      ).length,
    },
    artifacts: {
      changed: report.changedArtifacts.length,
      covered: covered.length,
      blindspots: blindspots.length,
    },
    status: complete ? "complete" : "partial",
  };
}

function intentDebt(
  session: ChangeSession,
  contract: GoalContract | null,
  report: ProofReport,
  criteria: readonly CriterionState[],
  coverage: GoalCoverageSummary,
  drifts: readonly IntentDrift[],
  conflicts: readonly SpecConflict[],
): IntentDebtItem[] {
  const items: IntentDebtItem[] = [];
  const add = (
    kind: IntentDebtKind,
    severity: ProofSeverity,
    subject: string,
    reason: string,
    blocks: readonly string[],
  ) => {
    const id = digest([subject, kind, reason]);
    if (!items.some((item) => item.id === id))
      items.push({ id, kind, severity, subject, reason: reason.slice(0, 1000), blocks });
  };
  if (!contract) {
    add(
      "no-must-outcome",
      "HIGH",
      session.id,
      "No adopted goal contract; goal satisfaction is undetermined.",
      [session.id],
    );
    if (session.proposedGoal)
      add(
        "unadopted-draft",
        "HIGH",
        "proposed-goal",
        "A staged goal draft has not been adopted.",
        [],
      );
    return items;
  }
  const states = new Map(criteria.map((state) => [state.criterionId, state]));
  const mustOutcomes = contract.desiredOutcomes.filter((outcome) => outcome.priority === "MUST");
  if (!mustOutcomes.length)
    add("no-must-outcome", "HIGH", contract.id, "The adopted contract has no MUST outcome.", [
      contract.id,
    ]);
  const criterionIds = new Set(contract.criteria.map((criterion) => criterion.id));
  for (const outcome of contract.desiredOutcomes) {
    if (
      outcome.criterionIds.length === 0 ||
      !outcome.criterionIds.some((id) => criterionIds.has(id))
    )
      add(
        "unmapped-outcome",
        outcome.priority === "MUST" ? "HIGH" : "MEDIUM",
        outcome.id,
        `Outcome ${outcome.key} has no adopted criterion.`,
        [outcome.id],
      );
  }
  for (const criterion of contract.criteria) {
    const priority = goalOutcomePriority(contract, criterion);
    const state = states.get(criterion.id);
    if (
      criterion.obligationIds.length === 0 ||
      !criterion.obligationIds.some((id) => session.nodes.some((node) => node.id === id))
    )
      add(
        "missing-criterion",
        priority === "MUST" ? "HIGH" : "MEDIUM",
        criterion.id,
        `Criterion ${criterion.key} has no linked proof obligation.`,
        [criterion.id],
      );
    if (criterion.evidenceKinds.length === 0 || criterion.statement.trim().length < 8)
      add(
        "ambiguous-criterion",
        priority === "MUST" ? "HIGH" : "MEDIUM",
        criterion.id,
        `Criterion ${criterion.key} is too ambiguous to evaluate deterministically.`,
        [criterion.id],
      );
    if (priority === "MUST" && state) {
      if (state.status === "unknown" || state.status === "stale")
        add(
          "inadequate-evidence",
          "HIGH",
          criterion.id,
          `MUST criterion ${criterion.key} has ${state.status} evidence.`,
          [criterion.id],
        );
      else if (state.status === "partial")
        add(
          "inadequate-evidence",
          "MEDIUM",
          criterion.id,
          `MUST criterion ${criterion.key} has only partial evidence.`,
          [criterion.id],
        );
      else if (state.status === "contradicted")
        add(
          "inadequate-evidence",
          "CRITICAL",
          criterion.id,
          `MUST criterion ${criterion.key} is contradicted.`,
          [criterion.id],
        );
    }
  }
  if (session.proposedGoal) {
    const hasMust = session.proposedGoal.desiredOutcomes.some(
      (outcome) => outcome.priority === "MUST",
    );
    add(
      "unadopted-draft",
      hasMust ? "HIGH" : "MEDIUM",
      "proposed-goal",
      "A staged goal draft has not been adopted.",
      [],
    );
  }
  for (const decision of contract.openDecisions)
    if (decision.status === "open" && decision.blocking)
      add(
        "open-decision",
        "HIGH",
        decision.id,
        `Open decision: ${decision.question}`,
        decision.blocks,
      );
  for (const preserve of contract.preserveContracts)
    if (
      !preserve.artifact ||
      !preserve.contractId ||
      !preserve.baselineHash ||
      !session.baseline.artifacts.some((artifact) => artifact.path === preserve.artifact)
    )
      add(
        "unsupported-preserve",
        preserve.severity === "CRITICAL" || preserve.severity === "HIGH" ? "HIGH" : "MEDIUM",
        preserve.id,
        `Preserve contract ${preserve.name} cannot be evaluated.`,
        preserve.obligationIds,
      );
  for (const forbidden of contract.forbiddenOutcomes)
    if (
      !forbidden.detector.target ||
      forbidden.detector.paths.length === 0 ||
      !["text-present", "text-absent", "artifact-exists", "symbol-exists"].includes(
        forbidden.detector.kind,
      )
    )
      add(
        "unfalsifiable-forbidden",
        forbidden.severity === "CRITICAL" || forbidden.severity === "HIGH" ? "HIGH" : "MEDIUM",
        forbidden.id,
        `Forbidden outcome ${forbidden.statement} has no supported falsifier.`,
        [forbidden.id],
      );
  for (const forbidden of contract.forbiddenOutcomes)
    if (
      forbidden.detector.target &&
      forbidden.detector.paths.length > 0 &&
      ["text-present", "text-absent", "artifact-exists", "symbol-exists"].includes(
        forbidden.detector.kind,
      ) &&
      !forbiddenDetected(session, forbidden) &&
      !forbiddenClear(session, forbidden)
    )
      add(
        "inadequate-evidence",
        "HIGH",
        forbidden.id,
        `Forbidden outcome ${forbidden.statement} has not been evaluated.`,
        [forbidden.id],
      );
  for (const preserve of contract.preserveContracts)
    if (!preserveVerified(session, preserve) && !preserveChanged(session, preserve))
      add(
        "unsupported-preserve",
        preserve.severity === "CRITICAL" || preserve.severity === "HIGH" ? "HIGH" : "MEDIUM",
        preserve.id,
        `Preserve contract ${preserve.name} cannot be verified from the observed baseline.`,
        preserve.obligationIds,
      );
  if (session.goalContractHistory?.some((history) => history.version > contract.version))
    add(
      "goal-contract-stale",
      "HIGH",
      contract.id,
      "A newer adopted contract version exists in history.",
      [contract.id],
    );
  if (!sameList(contract.boundary, session.boundary))
    add(
      "boundary-mismatch",
      "HIGH",
      contract.id,
      "Adopted contract boundary differs from the session boundary.",
      [contract.id],
    );
  for (const drift of drifts)
    add(
      "intent-drift",
      drift.kind === "criterion-weakened" || drift.kind === "preserve-baseline-changed"
        ? "CRITICAL"
        : "HIGH",
      drift.subject,
      drift.reason,
      [],
    );
  for (const conflict of conflicts.filter((item) => item.blocking))
    add("spec-conflict", "HIGH", conflict.id, conflict.reason, conflict.subjects);
  for (const nonGoal of contract.nonGoals)
    for (const path of report.changedArtifacts)
      if (inScope(path, nonGoal.paths))
        add(
          "non-goal-overlap",
          "HIGH",
          nonGoal.id,
          `Changed artifact ${path} overlaps a non-goal.`,
          [nonGoal.id],
        );
  if (coverage.status === "partial" && mustOutcomes.length > 0)
    for (const blindspot of report.blindspots.filter((item) => !item.investigated))
      add(
        "inadequate-evidence",
        "HIGH",
        blindspot.artifact,
        `Goal blindspot remains: ${blindspot.reasons.join("; ")}`,
        [],
      );
  return items;
}

function goalBlindspots(
  session: ChangeSession,
  contract: GoalContract | null,
  report: ProofReport,
): GoalBlindspot[] {
  if (!contract) return [];
  const nodes = new Map(session.nodes.map((node) => [node.id, node]));
  return report.blindspots.map((blindspot) => ({
    artifact: blindspot.artifact,
    risk: blindspot.risk,
    reasons: blindspot.reasons,
    criterionIds: contract.criteria
      .filter((criterion) =>
        criterion.obligationIds.some((id) =>
          nodes.get(id)?.action?.paths.some((path) => inScope(blindspot.artifact, [path])),
        ),
      )
      .map((criterion) => criterion.id)
      .sort(),
    investigated: blindspot.investigated,
  }));
}

function goalCeiling(
  session: ChangeSession,
  contract: GoalContract | null,
  criteria: readonly CriterionState[],
  report: ProofReport,
): GoalGuaranteeCeiling {
  if (!contract) return { level: 0, limitations: ["No adopted goal contract."], drivers: [] };
  const states = new Map(criteria.map((state) => [state.criterionId, state]));
  const drivers: { criterionId: string; level: ProofLevel; reason: string }[] = [];
  const levels: ProofLevel[] = [];
  for (const criterion of contract.criteria) {
    if (goalOutcomePriority(contract, criterion) !== "MUST") continue;
    const state = states.get(criterion.id);
    const achieved =
      state?.status === "supported" ? state.level : state?.status === "partial" ? state.level : 0;
    const linkedLevels = criterion.obligationIds.map(
      (id) => report.nodes.find((item) => item.nodeId === id)?.level ?? 0,
    ) as ProofLevel[];
    const level = Math.min(
      criterion.requiredLevel,
      achieved,
      ...(linkedLevels.length ? linkedLevels : [1]),
    ) as ProofLevel;
    levels.push(level);
    drivers.push({
      criterionId: criterion.id,
      level,
      reason:
        state?.status === "supported"
          ? "Sufficient fresh evidence."
          : state?.status === "partial"
            ? "Partial evidence below the required level."
            : `Criterion is ${state?.status ?? "unknown"}.`,
    });
  }
  const catalogLevel = Math.max(
    1,
    ...(session.current.verificationCatalog ?? []).map((item) => item.level),
  ) as ProofLevel;
  if (levels.length) levels.push(catalogLevel);
  if (!session.current.complete) levels.push(0);
  const level = (levels.length ? Math.min(...levels) : 0) as ProofLevel;
  const limitations = [
    ...session.current.limitations,
    ...contract.criteria.flatMap((criterion) => criterion.limitations ?? []),
    ...(level < 5
      ? ["Guarantee ceiling is an ordinal policy bound, not a probability or runtime guarantee."]
      : []),
  ];
  return { level, limitations: [...new Set(limitations)], drivers };
}

function goalBlockers(
  session: ChangeSession,
  contract: GoalContract | null,
  criteria: readonly CriterionState[],
  debt: readonly IntentDebtItem[],
  report: ProofReport,
  status: GoalSatisfactionStatus,
): GoalBlocker[] {
  const blockers: GoalBlocker[] = [];
  const add = (blocker: GoalBlocker) => {
    if (
      !blockers.some(
        (item) =>
          item.kind === blocker.kind && item.id === blocker.id && item.reason === blocker.reason,
      )
    )
      blockers.push(blocker);
  };
  if (!contract) {
    add({ kind: "intent", id: session.id, reason: "No adopted goal contract." });
    return blockers;
  }
  const mustCriteria = contract.criteria.filter(
    (criterion) => goalOutcomePriority(contract, criterion) === "MUST",
  );
  const states = new Map(criteria.map((state) => [state.criterionId, state]));
  for (const criterion of mustCriteria) {
    const state = states.get(criterion.id);
    if (state?.status === "contradicted")
      add({
        kind: "contradiction",
        id: criterion.id,
        reason: `MUST criterion ${criterion.key} is contradicted.`,
      });
  }
  for (const forbidden of contract.forbiddenOutcomes)
    if (forbiddenDetected(session, forbidden))
      add({
        kind: "forbidden",
        id: forbidden.id,
        reason: `Forbidden outcome detected: ${forbidden.statement}`,
      });
  for (const preserve of contract.preserveContracts)
    if (preserveChanged(session, preserve))
      add({
        kind: "preserve",
        id: preserve.id,
        reason: `Preserve contract changed: ${preserve.artifact}.`,
      });
  for (const item of debt.filter((item) => SEVERITY_RANK[item.severity] <= SEVERITY_RANK.HIGH))
    add({ kind: "intent", id: item.id, reason: item.reason });
  const linked = new Set([...contract.criteria.flatMap((criterion) => criterion.obligationIds)]);
  for (const item of report.debt)
    if (linked.has(item.nodeId) && (item.severity === "CRITICAL" || item.severity === "HIGH"))
      add({ kind: "proof", id: item.nodeId, reason: item.reason });
  if (!session.current.complete)
    add({ kind: "observation", id: session.id, reason: "Repository observation is incomplete." });
  for (const decision of contract.openDecisions)
    if (decision.status === "open" && decision.blocking)
      add({
        kind: "decision",
        id: decision.id,
        reason: `Open blocking decision: ${decision.question}`,
      });
  if (status === "UNDETERMINED" && !blockers.length)
    add({ kind: "intent", id: session.id, reason: "Goal satisfaction is undetermined." });
  return blockers;
}

/**
 * Deterministic, pure goal evaluator. It owns IDs, adequacy, debt, coverage and
 * the final status. A model, receipt or MCP caller cannot supply any of them.
 */
export function evaluateGoalSatisfaction(
  session: ChangeSession,
  report: ProofReport,
): GoalSatisfactionReport {
  const contract = session.goalContract ?? null;
  const nodes = new Map(session.nodes.map((node) => [node.id, node]));
  let criteria: CriterionState[] = [];
  if (contract) {
    criteria = applyDependencies(
      contract.criteria,
      contract.criteria.map((criterion) => evaluateCriterion(session, criterion, nodes)),
    );
  }
  const drifts = contract ? detectDrifts(session, contract, report) : [];
  const conflicts = contract ? detectConflicts(session, contract, nodes) : [];
  const unintendedOutcomes = contract ? detectUnintended(session, contract, report) : [];
  const coverage = coverageSummary(session, contract, criteria, report);
  const debt = intentDebt(session, contract, report, criteria, coverage, drifts, conflicts);
  const ceiling = goalCeiling(session, contract, criteria, report);
  const testStatus = deriveTestStatus(session);
  const proofStatus = deriveProofStatus(session, report);
  const mustCriteria = contract
    ? contract.criteria.filter((criterion) => goalOutcomePriority(contract, criterion) === "MUST")
    : [];
  const states = new Map(criteria.map((state) => [state.criterionId, state]));
  const mustOutcomes =
    contract?.desiredOutcomes.filter((outcome) => outcome.priority === "MUST") ?? [];
  const blockedDebt = debt.some((item) => item.severity === "CRITICAL" || item.severity === "HIGH");
  const linkedProofDebt = report.debt.some(
    (item) =>
      (item.severity === "CRITICAL" || item.severity === "HIGH") &&
      contract?.criteria.some((criterion) => criterion.obligationIds.includes(item.nodeId)),
  );
  const openDecision =
    contract?.openDecisions.some((decision) => decision.status === "open" && decision.blocking) ??
    false;
  const forbidden =
    contract?.forbiddenOutcomes.some((outcome) => forbiddenDetected(session, outcome)) ?? false;
  const preserve =
    contract?.preserveContracts.some(
      (item) =>
        preserveChanged(session, item) &&
        !(session.justifications ?? []).some((justification) =>
          inScope(item.artifact, justification.paths),
        ),
    ) ?? false;
  const forbiddenUnknown =
    contract?.forbiddenOutcomes.some(
      (item) => !forbiddenDetected(session, item) && !forbiddenClear(session, item),
    ) ?? false;
  const preserveUnknown =
    contract?.preserveContracts.some(
      (item) => !preserveVerified(session, item) && !preserveChanged(session, item),
    ) ?? false;
  const weakening = drifts.some(
    (drift) => drift.kind === "criterion-weakened" || drift.kind === "preserve-baseline-changed",
  );
  const contradictory = conflicts.some(
    (conflict) => conflict.blocking && conflict.kind === "contradictory-assertions",
  );
  const reviewOnly = mustCriteria.some((criterion) => criterion.assertion === "review-only");
  const mustContradicted = mustCriteria.some(
    (criterion) => states.get(criterion.id)?.status === "contradicted",
  );
  const mustUnknown = mustCriteria.some((criterion) => {
    const status = states.get(criterion.id)?.status;
    return status === "unknown" || status === "stale";
  });
  const mustPartial = mustCriteria.some(
    (criterion) => states.get(criterion.id)?.status === "partial",
  );
  const catalogLevel = Math.max(
    1,
    ...(session.current.verificationCatalog ?? []).map((item) => item.level),
  ) as ProofLevel;
  const verificationBound = mustCriteria.some(
    (criterion) =>
      criterion.requiredLevel > catalogLevel &&
      ["type-sound", "build-succeeds", "test-suite-passes", "runtime-behavior"].includes(
        criterion.assertion,
      ),
  );
  let status: GoalSatisfactionStatus;
  if (!contract || mustOutcomes.length === 0) status = "UNDETERMINED";
  else if (mustContradicted || forbidden || preserve || weakening || contradictory)
    status = "UNSATISFIED";
  else if (
    blockedDebt ||
    linkedProofDebt ||
    !session.current.complete ||
    mustUnknown ||
    reviewOnly ||
    coverage.status !== "complete" ||
    openDecision ||
    forbiddenUnknown ||
    preserveUnknown ||
    verificationBound
  )
    status = "UNDETERMINED";
  else if (mustPartial) status = "PARTIALLY_SATISFIED";
  else status = "SATISFIED";
  const blockers = goalBlockers(session, contract, criteria, debt, report, status);
  const limitations = [
    ...new Set([
      ...session.current.limitations,
      ...ceiling.limitations,
      "Goal satisfaction is bounded by adopted criteria and observed evidence; it is not universal correctness.",
      "Goal status, proof status and test status are independent; a passing test never implies goal satisfaction.",
    ]),
  ];
  return {
    contract,
    status,
    criteria,
    testStatus,
    proofStatus,
    intentDebt: debt,
    proofDebt: report.debt,
    coverage,
    ceiling,
    blockers,
    limitations,
    blindspots: goalBlindspots(session, contract, report),
    drifts,
    unintendedOutcomes,
    conflicts,
    differential: behavioralDifferential(session),
  };
}
