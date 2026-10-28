import type {
  ChangeReceipt,
  ProofDebtItem,
  ProofLevel,
  ProofNodeState,
  ProofSeverity,
  ProofStatus,
  VerificationAction,
} from "./proof";

/**
 * Goal-satisfaction contracts.
 *
 * These types are additive and optional. They describe intent and its
 * evaluation output; they do not themselves establish goal satisfaction.
 * A model may propose a `GoalContractDraft`, but only an explicit adoption
 * operation can create a `GoalContract`, and only deterministic evaluation can
 * assign a `GoalSatisfactionStatus`.
 */

/** Four discrete states. Never a probability or a percentage. */
export type GoalSatisfactionStatus =
  | "SATISFIED"
  | "PARTIALLY_SATISFIED"
  | "UNSATISFIED"
  | "UNDETERMINED";

export type DesiredOutcomePriority = "MUST" | "SHOULD" | "MAY";

/**
 * What kind of claim a criterion makes. Deterministic evidence adequacy maps
 * this value to permitted evidence kinds; a free-text statement is never
 * enough on its own.
 */
export type CriterionAssertion =
  | "artifact-presence"
  | "literal-presence"
  | "literal-absence"
  | "symbol-presence"
  | "contract-unchanged"
  | "type-sound"
  | "build-succeeds"
  | "test-suite-passes"
  | "runtime-behavior"
  | "review-only";

/** Evidence kinds the goal layer can reason about. */
export type OutcomeEvidenceKind =
  | "artifact-exists"
  | "text-absent"
  | "text-present"
  | "symbol-exists"
  | "type-check"
  | "build"
  | "test"
  | "contract-unchanged"
  | "runtime-probe"
  | "manual-review";

export type EvidenceAdequacy = "sufficient" | "partial" | "insufficient" | "unknown";

export type IntentDebtKind =
  | "missing-criterion"
  | "ambiguous-criterion"
  | "unadopted-draft"
  | "unmapped-outcome"
  | "open-decision"
  | "unsupported-preserve"
  | "unfalsifiable-forbidden"
  | "goal-contract-stale"
  | "intent-drift"
  | "spec-conflict"
  | "inadequate-evidence"
  | "non-goal-overlap"
  | "boundary-mismatch"
  | "no-must-outcome";

export type IntentDriftKind =
  | "goal-text-diverged"
  | "criterion-weakened"
  | "criterion-strengthened-unadopted"
  | "boundary-expanded"
  | "authorization-expanded"
  | "preserve-baseline-changed"
  | "outcome-unmapped"
  | "non-goal-violated";

export type SpecConflictKind =
  | "contradictory-assertions"
  | "preserve-vs-change"
  | "forbidden-vs-required"
  | "non-goal-vs-boundary"
  | "duplicate-key-divergence"
  | "unresolvable-ambiguity";

export type GoalBlockerKind =
  | "forbidden"
  | "preserve"
  | "contradiction"
  | "intent"
  | "proof"
  | "observation"
  | "decision";

export interface DesiredOutcome {
  readonly id: string;
  readonly key: string;
  readonly statement: string;
  readonly priority: DesiredOutcomePriority;
  readonly criterionIds: readonly string[];
  readonly provenance: "user" | "model-proposed" | "derived";
}

export interface AcceptanceCriterion {
  readonly id: string;
  readonly key: string;
  readonly version: number;
  readonly statement: string;
  readonly assertion: CriterionAssertion;
  readonly severity: ProofSeverity;
  readonly requiredLevel: ProofLevel;
  readonly outcomeIds: readonly string[];
  readonly dependsOn: readonly string[];
  readonly provenance: "user" | "model-proposed" | "derived";
  readonly adoptedAtRevision: string;
  readonly obligationIds: readonly string[];
  readonly evidenceKinds: readonly OutcomeEvidenceKind[];
  readonly limitations?: readonly string[];
}

export interface PreserveContract {
  readonly id: string;
  readonly artifact: string;
  readonly contractId: string;
  readonly name: string;
  readonly baselineHash: string;
  readonly severity: ProofSeverity;
  readonly provenance: "user" | "model-proposed" | "derived";
  readonly obligationIds: readonly string[];
}

export interface ForbiddenOutcome {
  readonly id: string;
  readonly statement: string;
  /**
   * Uses the existing `VerificationAction` union. Supported read-only
   * detectors are `text-present`, `artifact-exists` and TS/JS-family
   * `symbol-exists`; an unsupported detector evaluates to UNKNOWN.
   */
  readonly detector: VerificationAction;
  readonly severity: ProofSeverity;
  readonly provenance: "user" | "model-proposed" | "derived";
  /** Deterministic obligation created alongside adoption; optional for old data. */
  readonly obligationId?: string;
}

export interface NonGoal {
  readonly id: string;
  readonly statement: string;
  readonly reason: string;
  readonly paths: readonly string[];
}

export interface OpenDecision {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly status: "open" | "decided" | "deferred";
  readonly blocking: boolean;
  readonly blocks: readonly string[];
  readonly decision?: string;
  readonly decidedBy?: string;
  readonly decidedAtRevision?: string;
}

/**
 * An adopted, versioned intent document. It lives inside `ChangeSession`;
 * it is not a second session or a second store.
 */
export interface GoalContract {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly goal: string;
  readonly desiredOutcomes: readonly DesiredOutcome[];
  readonly criteria: readonly AcceptanceCriterion[];
  readonly preserveContracts: readonly PreserveContract[];
  readonly forbiddenOutcomes: readonly ForbiddenOutcome[];
  readonly nonGoals: readonly NonGoal[];
  readonly openDecisions: readonly OpenDecision[];
  readonly boundary: readonly string[];
  readonly authorizedPaths: readonly string[];
  readonly adoptedAtRevision: string;
  readonly provenance: "user" | "model-proposed" | "mixed";
}

/**
 * Untrusted compiler output. It has no IDs, levels, severities, actions or
 * verdicts; the deterministic compiler validates and assigns those only after
 * an explicit adoption.
 */
export interface GoalContractDraft {
  readonly schemaVersion: 1;
  readonly goal: string;
  readonly desiredOutcomes: readonly {
    key: string;
    statement: string;
    priority: DesiredOutcomePriority;
    criterionKeys: readonly string[];
  }[];
  readonly criteria: readonly {
    key: string;
    statement: string;
    assertion: CriterionAssertion;
    outcomeKeys: readonly string[];
    dependsOn?: readonly string[];
    evidenceKinds?: readonly OutcomeEvidenceKind[];
  }[];
  readonly preserveCandidates: readonly {
    artifact: string;
    contractId?: string;
    name?: string;
  }[];
  readonly forbiddenCandidates: readonly {
    statement: string;
    detectorKind: "text-present" | "artifact-exists" | "symbol-exists";
    target: string;
    paths: readonly string[];
  }[];
  readonly nonGoals: readonly { statement: string; reason: string; paths: readonly string[] }[];
  readonly openQuestions: readonly {
    question: string;
    options: readonly string[];
    blocks: readonly string[];
  }[];
  readonly limitations: readonly string[];
}

export interface AdoptGoalInput {
  readonly approved: boolean;
  readonly criterionKeys: readonly string[];
  readonly outcomeKeys?: readonly string[];
  readonly decisions?: readonly { key: string; reason: string }[];
  readonly goalPolicyVersion?: 1;
}

export interface GoalDismissal {
  readonly key: string;
  readonly reason: string;
}

export interface GoalProposalDecision extends GoalDismissal {
  readonly revision: string;
}

export interface IntentDebtItem {
  readonly id: string;
  readonly kind: IntentDebtKind;
  readonly severity: ProofSeverity;
  readonly subject: string;
  readonly reason: string;
  readonly blocks: readonly string[];
}

export interface IntentDrift {
  readonly id: string;
  readonly kind: IntentDriftKind;
  readonly subject: string;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

export interface UnintendedOutcome {
  readonly id: string;
  readonly kind: "preserve-changed" | "forbidden-detected" | "non-goal-touched" | "contract-added";
  readonly subject: string;
  readonly reason: string;
  readonly severity: ProofSeverity;
}

export interface SpecConflict {
  readonly id: string;
  readonly kind: SpecConflictKind;
  readonly subjects: readonly string[];
  readonly reason: string;
  readonly blocking: boolean;
}

export interface GoalBlindspot {
  readonly artifact: string;
  readonly risk: ProofSeverity;
  readonly reasons: readonly string[];
  readonly criterionIds: readonly string[];
  readonly investigated: boolean;
}

export interface BehavioralDifferential {
  readonly status: "unchanged" | "changed" | "unknown";
  readonly scope: readonly string[];
  readonly changes: readonly {
    artifact: string;
    kind: "contract" | "test-outcome" | "runtime-outcome";
    before: string;
    after: string;
  }[];
  readonly limitations: readonly string[];
}

export interface GoalGuaranteeCeiling {
  readonly level: ProofLevel;
  readonly limitations: readonly string[];
  readonly drivers: readonly { criterionId: string; level: ProofLevel; reason: string }[];
}

export interface CounterexampleSearchResult {
  readonly criterionId: string;
  readonly strategy:
    | "literal-present"
    | "symbol-present"
    | "contract-changed"
    | "test-failed"
    | "runtime-predicate-failed"
    | "non-goal-path-touched";
  readonly found: boolean | "unknown";
  readonly detail: string;
}

export interface FalsificationPlan {
  readonly criterionId: string;
  readonly strategy: CounterexampleSearchResult["strategy"];
  readonly action: VerificationAction;
  readonly priority: ProofSeverity;
  readonly cost: "low" | "medium";
  readonly falsifies: readonly string[];
}

/** Design-only economics contract; no phase executes it. */
export interface VerificationEconomyPlan {
  readonly actions: readonly {
    action: VerificationAction;
    criterionIds: readonly string[];
    cost: "low" | "medium";
  }[];
  readonly residualCriteria: readonly string[];
}

export interface GoalCoverageGraph {
  readonly nodes: readonly {
    id: string;
    kind:
      | "Goal"
      | "DesiredOutcome"
      | "AcceptanceCriterion"
      | "PreserveContract"
      | "ForbiddenOutcome"
      | "NonGoal"
      | "OpenDecision"
      | "ProofObligation"
      | "Evidence"
      | "RepositoryArtifact";
    version?: number;
    status?: GoalSatisfactionStatus | ProofStatus;
  }[];
  readonly edges: readonly {
    from: string;
    to: string;
    kind:
      | "requires"
      | "preserves"
      | "forbids"
      | "excludes"
      | "decides"
      | "verified_by"
      | "evidenced_by"
      | "affects"
      | "drifts_from";
    observedRevision: string;
  }[];
  readonly gaps: readonly { criterionId: string; missing: string }[];
}

export interface GoalCoverageSummary {
  readonly outcomes: { total: number; must: number; mapped: number; unmapped: number };
  readonly criteria: {
    total: number;
    supported: number;
    partial: number;
    contradicted: number;
    stale: number;
    unknown: number;
  };
  readonly preserveContracts: { total: number; verified: number; changed: number; unknown: number };
  readonly forbiddenOutcomes: { total: number; clear: number; detected: number; unknown: number };
  readonly artifacts: { changed: number; covered: number; blindspots: number };
  readonly status: "complete" | "partial" | "absent";
}

export interface CriterionState {
  readonly criterionId: string;
  readonly status: "supported" | "partial" | "contradicted" | "stale" | "unknown";
  readonly level: ProofLevel;
  readonly adequacy: EvidenceAdequacy;
  readonly evidenceIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface TestStatusSummary {
  readonly commands: readonly {
    key: string;
    level: 2 | 3 | 4;
    result: "pass" | "fail" | "unknown";
    revision: string;
    stale: boolean;
  }[];
  readonly outcome: "passing" | "failing" | "mixed" | "not-run" | "stale";
}

export interface ProofStatusSummary {
  readonly nodes: readonly ProofNodeState[];
  readonly completion: "proven" | "not-proven" | "blocked";
  readonly ceiling: ProofLevel;
  readonly debt: readonly ProofDebtItem[];
}

export interface GoalBlocker {
  readonly kind: GoalBlockerKind;
  readonly id: string;
  readonly reason: string;
}

export interface GoalSatisfactionReport {
  readonly contract: GoalContract | null;
  readonly status: GoalSatisfactionStatus;
  readonly criteria: readonly CriterionState[];
  readonly testStatus: TestStatusSummary;
  readonly proofStatus: ProofStatusSummary;
  readonly intentDebt: readonly IntentDebtItem[];
  readonly proofDebt: readonly ProofDebtItem[];
  readonly coverage: GoalCoverageSummary;
  readonly ceiling: GoalGuaranteeCeiling;
  readonly blockers: readonly GoalBlocker[];
  readonly limitations: readonly string[];
  /** Additive Phase 8 projections. They are derived, never persisted as truth. */
  readonly blindspots?: readonly GoalBlindspot[];
  readonly drifts?: readonly IntentDrift[];
  readonly unintendedOutcomes?: readonly UnintendedOutcome[];
  readonly conflicts?: readonly SpecConflict[];
  readonly differential?: BehavioralDifferential;
}

/**
 * Extends the existing receipt without changing the meaning of `completion`
 * or `policyVersion`. `goalStatus` is independent of both.
 */
export interface GoalSatisfactionReceipt extends ChangeReceipt {
  readonly receiptKind: "goal-satisfaction";
  readonly goalPolicyVersion: 1;
  readonly goalContractVersion: number | null;
  readonly goalStatus: GoalSatisfactionStatus;
  readonly testStatus: TestStatusSummary;
  readonly proofStatus: ProofStatusSummary;
  readonly intentDebt: readonly IntentDebtItem[];
  readonly coverage: GoalCoverageSummary;
  readonly satisfiedCriteria: readonly string[];
  readonly partialCriteria: readonly string[];
  readonly unsatisfiedCriteria: readonly string[];
  readonly undeterminedCriteria: readonly string[];
  readonly blockers: readonly GoalBlocker[];
}
