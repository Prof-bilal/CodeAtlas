import type {
  GoalContract,
  GoalContractDraft,
  GoalProposalDecision,
  GoalSatisfactionReport,
  IntentDebtItem,
} from "./goal";

/** Proof state is distinct from the rebuildable repository context cache. */
export type ProofLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type ProofStatus = "unproven" | "supported" | "stale" | "contradicted";
export type ProofSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type ChangeSessionState =
  | "INVESTIGATING"
  | "PLANNED"
  | "IMPLEMENTING"
  | "VERIFYING"
  | "PROVEN"
  | "NOT_PROVEN"
  | "BLOCKED";
export type ProofNodeKind =
  | "Requirement"
  | "Constraint"
  | "Invariant"
  | "Claim"
  | "Assumption"
  | "Unknown"
  | "ProofObligation";
export type ProofEdgeKind =
  | "supports"
  | "depends_on"
  | "contradicts"
  | "verifies"
  | "invalidates"
  | "derived_from"
  | "required_by"
  | "affects"
  | "authorizes"
  | "observed_at";
export interface TemporalProofGraph {
  readonly nodes: readonly {
    id: string;
    kind:
      | ProofNodeKind
      | "Change"
      | "Evidence"
      | "VerificationAction"
      | "RepositoryArtifact"
      | "RepositoryRevision";
    version?: number;
  }[];
  readonly edges: readonly {
    from: string;
    to: string;
    kind: ProofEdgeKind;
    observedRevision: string;
  }[];
}

export interface RepositoryArtifact {
  readonly id: string;
  readonly path: string;
  readonly hash: string;
  /** Conservative syntax-normalized hash, only available for supported syntax. */
  readonly semanticHash?: string;
  /** Stable across whitespace/line movement, conservative for inferred public types. */
  readonly contracts?: readonly { id: string; name: string; hash: string }[];
}
export interface CouplingSignal {
  readonly from: string;
  readonly to: string;
  readonly kind: "static" | "shared-test" | "co-change" | "proof-failure" | "agent-miss";
  readonly value: number;
  readonly samples: number;
}
export interface RepositoryRevision {
  readonly id: string;
  readonly repositoryId: string;
  readonly head: string | null;
  readonly observedAt: string;
  readonly complete: boolean;
  readonly artifacts: readonly RepositoryArtifact[];
  /** File-level projection of the existing indexed graph, never a second code graph. */
  readonly dependencies: readonly { from: string; to: string; kind: string }[];
  readonly limitations: readonly string[];
  /** Ranking hints only; never establish or invalidate truth. */
  readonly coupling?: readonly CouplingSignal[];
  readonly environmentId?: string;
  /** Host-approved verification capabilities, never executable strings from a proposal. */
  readonly verificationCatalog?: readonly {
    key: string;
    level: ProofLevel;
    kind: "command" | "runtime-probe";
    cost: "low" | "medium";
  }[];
}
export interface VerificationAction {
  readonly kind:
    | "artifact-exists"
    | "text-absent"
    | "text-present"
    | "symbol-exists"
    | "command"
    | "runtime-probe"
    | "public-contract-unchanged";
  readonly paths: readonly string[];
  /**
   * Literal text for text-absent/text-present, a TS-family symbol name for
   * symbol-exists, or an approved configuration key for command/runtime-probe.
   */
  readonly target: string;
}
export interface ProofNode {
  readonly id: string;
  readonly version: number;
  readonly kind: ProofNodeKind;
  readonly statement: string;
  readonly severity: ProofSeverity;
  readonly minimumLevel: ProofLevel;
  readonly dependsOn: readonly string[];
  readonly provenance: "user" | "model-proposed" | "derived";
  readonly action: VerificationAction | null;
}
export interface Requirement extends ProofNode {
  readonly kind: "Requirement";
}
export interface Constraint extends ProofNode {
  readonly kind: "Constraint";
}
export interface Invariant extends ProofNode {
  readonly kind: "Invariant";
}
export interface Claim extends ProofNode {
  readonly kind: "Claim";
}
export interface Assumption extends ProofNode {
  readonly kind: "Assumption";
}
export interface Unknown extends ProofNode {
  readonly kind: "Unknown";
}
export interface ProofObligation extends ProofNode {
  readonly kind: "ProofObligation";
}
export interface Evidence {
  readonly id: string;
  readonly nodeId: string;
  readonly nodeVersion: number;
  readonly observedRevision: string;
  readonly validFromRevision: string;
  readonly validUntilRevision: string | null;
  readonly sourceArtifactIds: readonly string[];
  readonly scope: readonly string[];
  readonly derivation: string;
  readonly level: ProofLevel;
  readonly result: "pass" | "fail" | "unknown";
  readonly status: "fresh" | "stale";
  readonly invalidatedBy: readonly string[];
  readonly expiresAt?: string;
  /** Actual investigation is separate from the broader invalidation dependency scope. */
  readonly investigatedPaths?: readonly string[];
  /** Optional, derived goal links. They never establish adequacy by themselves. */
  readonly criterionIds?: readonly string[];
  readonly outcomeKind?:
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
  /** Recomputed on every evaluation; persisted values are never trusted. */
  readonly adequacy?: "sufficient" | "partial" | "insufficient" | "unknown";
}
export interface VerificationResult {
  readonly result: "pass" | "fail" | "unknown";
  readonly level: ProofLevel;
  readonly detail: string;
  readonly expiresAt?: string;
  readonly investigatedPaths?: readonly string[];
}
export interface ProofDebtItem {
  readonly nodeId: string;
  readonly severity: ProofSeverity;
  readonly reason: string;
}
export interface ProofNodeState {
  readonly nodeId: string;
  readonly status: ProofStatus;
  readonly level: ProofLevel;
}
export interface Blindspot {
  readonly artifact: string;
  readonly risk: ProofSeverity;
  readonly reasons: readonly string[];
  readonly investigated: boolean;
}
export interface ChangeReceipt {
  readonly id: string;
  readonly sessionId: string;
  readonly baselineRevision: string;
  readonly finalRevision: string;
  readonly policyVersion: 1;
  readonly completion: "proven" | "not-proven" | "blocked";
  readonly debt: readonly ProofDebtItem[];
  readonly changedArtifacts: readonly string[];
  readonly semanticChanges: readonly string[];
  readonly unjustifiedMutations: readonly string[];
  readonly guaranteeCeiling: ProofLevel;
  readonly limitations: readonly string[];
}
export interface ChangeSession {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly goal: string;
  readonly repositoryId: string;
  readonly baseline: RepositoryRevision;
  readonly current: RepositoryRevision;
  readonly boundary: readonly string[];
  /** Artifact paths explicitly authorized by the user; an empty list authorizes none. */
  readonly authorizedPaths: readonly string[];
  readonly semanticChangeBudget: number;
  readonly state: ChangeSessionState;
  readonly nodes: readonly ProofNode[];
  readonly evidence: readonly Evidence[];
  readonly receipts: readonly ChangeReceipt[];
  readonly investigationRules?: readonly InvestigationRule[];
  readonly justifications?: readonly MutationJustification[];
  /** Explicit, unaccepted compiler output; never participates in truth evaluation. */
  readonly proposed?: readonly ProofProposal[];
  readonly proposalDecisions?: readonly { key: string; reason: string; revision: string }[];
  /**
   * Adopted goal intent. Optional, additive and never inferred from a model
   * draft. Its presence does not by itself establish goal satisfaction.
   */
  readonly goalContract?: GoalContract;
  /** Staged, unadopted goal intent. Never participates in truth evaluation. */
  readonly proposedGoal?: GoalContractDraft;
  /** Bounded audit trail for dismissed goal intent. */
  readonly goalProposalDecisions?: readonly GoalProposalDecision[];
  /**
   * Prior adopted contracts, newest last. Optional and bounded. It exists only
   * so structural weakening can be detected; it is never consulted as truth.
   */
  readonly goalContractHistory?: readonly GoalContract[];
}
/**
 * Additive portable export. v1 flat sessions remain accepted; `exportVersion`
 * and `goalIntentDebt` are optional and never verdicts.
 */
export interface PortableChangeState extends ChangeSession {
  readonly exportVersion?: 1 | 2;
  readonly goalIntentDebt?: readonly IntentDebtItem[];
}
export interface InvestigationRule {
  readonly triggerPaths: readonly string[];
  readonly expectedPaths: readonly string[];
  readonly reason: string;
}
export interface MutationJustification {
  readonly paths: readonly string[];
  readonly nodeId: string;
  readonly reason: string;
  readonly kind: "requirement" | "constraint" | "invariant" | "bug" | "refactor" | "dependency";
}
export interface ProofHistoryEntry {
  readonly version: number;
  readonly session: ChangeSession;
}
export interface ProofProposal {
  readonly key: string;
  readonly kind: ProofNodeKind;
  readonly statement: string;
  readonly severity?: ProofSeverity;
  readonly minimumLevel?: ProofLevel;
  readonly dependsOn?: readonly string[];
  readonly provenance?: "user" | "model-proposed" | "derived";
  readonly action?: VerificationAction;
}
export interface ProofReport {
  readonly session: ChangeSession;
  readonly nodes: readonly ProofNodeState[];
  readonly debt: readonly ProofDebtItem[];
  readonly changedArtifacts: readonly string[];
  readonly semanticChanges: readonly string[];
  readonly unjustifiedMutations: readonly string[];
  readonly blindspots: readonly Blindspot[];
  readonly nextActions: readonly {
    nodeId: string;
    action: VerificationAction;
    priority: ProofSeverity;
    cost: "low" | "medium";
    settles: readonly string[];
    requiresAdoption?: boolean;
    reason?: string;
    /** Falsification planner annotations; they never execute anything. */
    falsifies?: readonly string[];
    coversCriteria?: readonly string[];
  }[];
  readonly guaranteeCeiling: ProofLevel;
  readonly contractChanges: readonly {
    artifact: string;
    name: string;
    change: "added" | "removed" | "changed";
  }[];
  /** Derived goal judgement. Optional so legacy report readers ignore it. */
  readonly goal?: GoalSatisfactionReport;
}
