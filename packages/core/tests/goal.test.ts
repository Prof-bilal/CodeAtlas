import { describe, expect, it } from "vitest";
import type {
  AdoptGoalInput,
  GoalContract,
  GoalContractDraft,
  GoalCoverageGraph,
  GoalCoverageSummary,
  GoalSatisfactionReceipt,
  GoalSatisfactionReport,
  IntentDebtItem,
} from "../src/domain/goal";

const emptyCoverage: GoalCoverageSummary = {
  outcomes: { total: 0, must: 0, mapped: 0, unmapped: 0 },
  criteria: { total: 0, supported: 0, partial: 0, contradicted: 0, stale: 0, unknown: 0 },
  preserveContracts: { total: 0, verified: 0, changed: 0, unknown: 0 },
  forbiddenOutcomes: { total: 0, clear: 0, detected: 0, unknown: 0 },
  artifacts: { changed: 0, covered: 0, blindspots: 0 },
  status: "absent",
};

const contract: GoalContract = {
  schemaVersion: 1,
  id: "contract-1",
  version: 1,
  goal: "Remove literal JWT references from src",
  desiredOutcomes: [
    {
      id: "outcome-1",
      key: "no-jwt",
      statement: "No literal JWT references remain in src",
      priority: "MUST",
      criterionIds: ["criterion-1"],
      provenance: "user",
    },
  ],
  criteria: [
    {
      id: "criterion-1",
      key: "absence",
      version: 1,
      statement: "Literal JWT is absent from src",
      assertion: "literal-absence",
      severity: "CRITICAL",
      requiredLevel: 1,
      outcomeIds: ["outcome-1"],
      dependsOn: [],
      provenance: "user",
      adoptedAtRevision: "revision-1",
      obligationIds: ["node-1"],
      evidenceKinds: ["text-absent"],
    },
  ],
  preserveContracts: [],
  forbiddenOutcomes: [],
  nonGoals: [],
  openDecisions: [],
  boundary: ["src"],
  authorizedPaths: ["src"],
  adoptedAtRevision: "revision-1",
  provenance: "user",
};

describe("goal-satisfaction contracts", () => {
  it("expresses an adopted contract with a MUST outcome and a typed criterion", () => {
    expect(contract.goal).toContain("JWT");
    expect(contract.desiredOutcomes[0]?.priority).toBe("MUST");
    expect(contract.criteria[0]?.assertion).toBe("literal-absence");
    expect(contract.criteria[0]?.obligationIds).toEqual(["node-1"]);
  });

  it("keeps proof completion independent of goal status", () => {
    const receipt: GoalSatisfactionReceipt = {
      id: "receipt-1",
      sessionId: "session-1",
      baselineRevision: "revision-0",
      finalRevision: "revision-1",
      policyVersion: 1,
      completion: "proven",
      debt: [],
      changedArtifacts: ["src/auth.ts"],
      semanticChanges: ["src/auth.ts"],
      unjustifiedMutations: [],
      guaranteeCeiling: 1,
      limitations: ["Proof is limited to explicit obligations."],
      receiptKind: "goal-satisfaction",
      goalPolicyVersion: 1,
      goalContractVersion: 1,
      goalStatus: "UNDETERMINED",
      testStatus: {
        commands: [{ key: "test", level: 3, result: "pass", revision: "revision-1", stale: false }],
        outcome: "passing",
      },
      proofStatus: {
        nodes: [{ nodeId: "node-1", status: "supported", level: 1 }],
        completion: "proven",
        ceiling: 1,
        debt: [],
      },
      intentDebt: [
        {
          id: "intent-1",
          kind: "ambiguous-criterion",
          severity: "HIGH",
          subject: "criterion-2",
          reason: "Criterion does not declare a scope.",
          blocks: ["criterion-2"],
        },
      ],
      coverage: {
        ...emptyCoverage,
        outcomes: { total: 1, must: 1, mapped: 1, unmapped: 0 },
        criteria: { total: 1, supported: 1, partial: 0, contradicted: 0, stale: 0, unknown: 0 },
        status: "partial",
      },
      satisfiedCriteria: [],
      partialCriteria: [],
      unsatisfiedCriteria: [],
      undeterminedCriteria: ["criterion-2"],
      blockers: [{ kind: "intent", id: "intent-1", reason: "Ambiguous criterion." }],
    };

    expect(receipt.completion).toBe("proven");
    expect(receipt.goalStatus).toBe("UNDETERMINED");
    expect(receipt.testStatus.outcome).toBe("passing");
    expect(receipt.intentDebt).toHaveLength(1);
  });

  it("projects goal coverage as a graph over existing proof nodes", () => {
    const graph: GoalCoverageGraph = {
      nodes: [
        { id: "contract-1", kind: "Goal", version: 1 },
        { id: "outcome-1", kind: "DesiredOutcome" },
        { id: "criterion-1", kind: "AcceptanceCriterion", version: 1, status: "supported" },
        { id: "node-1", kind: "ProofObligation", version: 1 },
        { id: "evidence-1", kind: "Evidence", status: "supported" },
      ],
      edges: [
        { from: "contract-1", to: "outcome-1", kind: "requires", observedRevision: "revision-1" },
        { from: "outcome-1", to: "criterion-1", kind: "requires", observedRevision: "revision-1" },
        {
          from: "criterion-1",
          to: "node-1",
          kind: "verified_by",
          observedRevision: "revision-1",
        },
        {
          from: "node-1",
          to: "evidence-1",
          kind: "evidenced_by",
          observedRevision: "revision-1",
        },
      ],
      gaps: [],
    };

    expect(graph.nodes.map((node) => node.kind)).toContain("AcceptanceCriterion");
    expect(graph.edges.filter((edge) => edge.kind === "verified_by")).toHaveLength(1);
  });

  it("represents intent debt separately from proof debt", () => {
    const debt: IntentDebtItem = {
      id: "intent-2",
      kind: "unmapped-outcome",
      severity: "HIGH",
      subject: "outcome-2",
      reason: "MUST outcome has no adopted criterion.",
      blocks: ["outcome-2"],
    };
    const report: GoalSatisfactionReport = {
      contract: null,
      status: "UNDETERMINED",
      criteria: [],
      testStatus: { commands: [], outcome: "not-run" },
      proofStatus: { nodes: [], completion: "not-proven", ceiling: 0, debt: [] },
      intentDebt: [debt],
      proofDebt: [],
      coverage: emptyCoverage,
      ceiling: { level: 0, limitations: ["No adopted contract."], drivers: [] },
      blockers: [{ kind: "intent", id: debt.id, reason: debt.reason }],
      limitations: ["No adopted goal contract."],
    };

    expect(report.status).toBe("UNDETERMINED");
    expect(report.proofDebt).toHaveLength(0);
    expect(report.intentDebt[0]?.kind).toBe("unmapped-outcome");
  });

  it("keeps model drafts free of actions, levels and verdicts", () => {
    const draft: GoalContractDraft = {
      schemaVersion: 1,
      goal: "Remove literal JWT references from src",
      desiredOutcomes: [
        {
          key: "no-jwt",
          statement: "No literal JWT references remain in src",
          priority: "MUST",
          criterionKeys: ["absence"],
        },
      ],
      criteria: [
        {
          key: "absence",
          statement: "Literal JWT is absent from src",
          assertion: "literal-absence",
          outcomeKeys: ["no-jwt"],
          evidenceKinds: ["text-absent"],
        },
      ],
      preserveCandidates: [],
      forbiddenCandidates: [],
      nonGoals: [],
      openQuestions: [],
      limitations: ["Model-proposed interpretation; adoption is required."],
    };

    expect(Object.keys(draft.criteria[0] ?? {})).not.toContain("action");
    expect(Object.keys(draft.criteria[0] ?? {})).not.toContain("minimumLevel");
    expect(draft.criteria[0]?.assertion).toBe("literal-absence");

    const adoption: AdoptGoalInput = { approved: true, criterionKeys: ["absence"] };
    expect(adoption.approved).toBe(true);
    expect(adoption.criterionKeys).toEqual(["absence"]);
  });
});
