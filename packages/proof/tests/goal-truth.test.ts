import type {
  AcceptanceCriterion,
  ChangeSession,
  GoalContract,
  GoalContractDraft,
  RepositoryRevision,
} from "@prof-bilal/atlas-core";
import { describe, expect, it } from "vitest";
import { assessAdequacy, evaluateGoalSatisfaction, evaluateProof } from "../src/index";

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Expected ${name}`);
  return value;
}

function artifact(
  path: string,
  hash = "one",
  contracts?: readonly { id: string; name: string; hash: string }[],
): RepositoryRevision["artifacts"][number] {
  return { id: `id:${path}`, path, hash, ...(contracts ? { contracts } : {}) };
}

function revision(overrides: Partial<RepositoryRevision> = {}): RepositoryRevision {
  return {
    id: "r1",
    repositoryId: "repo",
    head: null,
    observedAt: "now",
    complete: true,
    artifacts: [artifact("src/a.ts")],
    dependencies: [],
    limitations: [],
    ...overrides,
  };
}

function criterion(overrides: Partial<AcceptanceCriterion> = {}): AcceptanceCriterion {
  return {
    id: "criterion",
    key: "absence",
    version: 1,
    statement: "The literal is absent from the declared scope.",
    assertion: "literal-absence",
    severity: "CRITICAL",
    requiredLevel: 1,
    outcomeIds: ["outcome"],
    dependsOn: [],
    provenance: "user",
    adoptedAtRevision: "r1",
    obligationIds: ["obligation"],
    evidenceKinds: ["text-absent"],
    ...overrides,
  };
}

function contract(overrides: Partial<GoalContract> = {}): GoalContract {
  return {
    schemaVersion: 1,
    id: "contract",
    version: 1,
    goal: "Absent literal",
    desiredOutcomes: [
      {
        id: "outcome",
        key: "absent",
        statement: "The literal is absent.",
        priority: "MUST",
        criterionIds: ["criterion"],
        provenance: "user",
      },
    ],
    criteria: [criterion()],
    preserveContracts: [],
    forbiddenOutcomes: [],
    nonGoals: [],
    openDecisions: [],
    boundary: ["."],
    authorizedPaths: [],
    adoptedAtRevision: "r1",
    provenance: "user",
    ...overrides,
  };
}

function baseSession(overrides: Partial<ChangeSession> = {}): ChangeSession {
  return {
    schemaVersion: 1,
    id: "session",
    version: 1,
    goal: "Absent literal",
    repositoryId: "repo",
    baseline: revision(),
    current: revision(),
    boundary: ["."],
    authorizedPaths: [],
    semanticChangeBudget: 20,
    state: "VERIFYING",
    nodes: [
      {
        id: "obligation",
        version: 1,
        kind: "ProofObligation",
        statement: "Absence checked",
        severity: "CRITICAL",
        minimumLevel: 1,
        dependsOn: [],
        provenance: "user",
        action: { kind: "text-absent", paths: ["src"], target: "JWT" },
      },
      {
        id: "requirement",
        version: 1,
        kind: "Requirement",
        statement: "Absent literal",
        severity: "CRITICAL",
        minimumLevel: 1,
        dependsOn: ["obligation"],
        provenance: "user",
        action: null,
      },
    ],
    evidence: [
      {
        id: "evidence",
        nodeId: "obligation",
        nodeVersion: 1,
        observedRevision: "r1",
        validFromRevision: "r1",
        validUntilRevision: null,
        sourceArtifactIds: ["id:src/a.ts"],
        scope: ["src"],
        derivation: "literal absent",
        level: 1,
        result: "pass",
        status: "fresh",
        invalidatedBy: [],
        investigatedPaths: ["src/a.ts"],
        outcomeKind: "text-absent",
      },
    ],
    receipts: [],
    ...overrides,
  };
}

function goal(session: ChangeSession) {
  return evaluateProof(session).goal;
}

describe("goal truth evaluation", () => {
  it("satisfies only when every MUST criterion has sufficient evidence", () => {
    const report = goal(baseSession({ goalContract: contract() }));
    expect(report?.status).toBe("SATISFIED");
    expect(report?.criteria[0]).toMatchObject({ status: "supported", adequacy: "sufficient" });
    expect(report?.coverage.status).toBe("complete");
    expect(report?.testStatus.outcome).toBe("not-run");
    expect(report?.proofStatus.completion).toBe("proven");
  });

  it("never lets a passing test satisfy a runtime criterion", () => {
    const runtime = criterion({
      assertion: "runtime-behavior",
      requiredLevel: 5,
      evidenceKinds: ["runtime-probe"],
      obligationIds: ["obligation"],
    });
    const session = baseSession({
      goalContract: contract({ criteria: [runtime] }),
      evidence: [
        {
          ...required(baseSession().evidence[0], "evidence"),
          outcomeKind: "test",
          level: 3,
        },
      ],
    });
    const report = goal(session);
    expect(report?.criteria[0]?.status).toBe("unknown");
    expect(report?.status).not.toBe("SATISFIED");
    expect(report?.intentDebt.some((item) => item.kind === "inadequate-evidence")).toBe(true);
  });

  it("marks a detected forbidden outcome UNSATISFIED even when proof is otherwise green", () => {
    const session = baseSession({
      current: revision({ artifacts: [artifact("src/a.ts"), artifact("src/forbidden.ts")] }),
      goalContract: contract({
        forbiddenOutcomes: [
          {
            id: "forbidden",
            statement: "No forbidden artifact",
            detector: { kind: "artifact-exists", paths: ["src"], target: "src/forbidden.ts" },
            severity: "CRITICAL",
            provenance: "user",
            obligationId: "forbidden-obligation",
          },
        ],
      }),
    });
    const report = goal(session);
    expect(report?.status).toBe("UNSATISFIED");
    expect(report?.unintendedOutcomes?.some((item) => item.kind === "forbidden-detected")).toBe(
      true,
    );
  });

  it("marks a changed preserve contract UNSATISFIED", () => {
    const session = baseSession({
      baseline: revision({
        artifacts: [artifact("src/a.ts", "one", [{ id: "api", name: "api", hash: "old" }])],
      }),
      current: revision({
        artifacts: [artifact("src/a.ts", "two", [{ id: "api", name: "api", hash: "new" }])],
      }),
      goalContract: contract({
        preserveContracts: [
          {
            id: "preserve",
            artifact: "src/a.ts",
            contractId: "api",
            name: "api",
            baselineHash: "old",
            severity: "CRITICAL",
            provenance: "user",
            obligationIds: [],
          },
        ],
      }),
    });
    const report = goal(session);
    expect(report?.status).toBe("UNSATISFIED");
    expect(report?.coverage.preserveContracts.changed).toBe(1);
  });

  it("returns UNDETERMINED with no contract or no MUST outcome", () => {
    expect(goal(baseSession())?.status).toBe("UNDETERMINED");
    expect(
      goal(
        baseSession({
          goalContract: contract({
            desiredOutcomes: [
              {
                id: "outcome",
                key: "optional",
                statement: "Optional",
                priority: "SHOULD",
                criterionIds: ["criterion"],
                provenance: "user",
              },
            ],
          }),
        }),
      )?.status,
    ).toBe("UNDETERMINED");
  });

  it("reports an unmapped MUST outcome as intent debt", () => {
    const report = goal(
      baseSession({
        goalContract: contract({
          desiredOutcomes: [
            {
              id: "outcome",
              key: "absent",
              statement: "Absent",
              priority: "MUST",
              criterionIds: [],
              provenance: "user",
            },
          ],
        }),
      }),
    );
    expect(report?.status).toBe("UNDETERMINED");
    expect(report?.intentDebt.some((item) => item.kind === "unmapped-outcome")).toBe(true);
  });

  it("keeps a blocking open decision UNDETERMINED", () => {
    const report = goal(
      baseSession({
        goalContract: contract({
          openDecisions: [
            {
              id: "decision",
              question: "Is the legacy path allowed?",
              options: ["yes", "no"],
              status: "open",
              blocking: true,
              blocks: ["criterion"],
            },
          ],
        }),
      }),
    );
    expect(report?.status).toBe("UNDETERMINED");
    expect(report?.blockers.some((blocker) => blocker.kind === "decision")).toBe(true);
  });

  it("treats stale evidence as unknown, never as support", () => {
    const session = baseSession({
      evidence: [{ ...required(baseSession().evidence[0], "evidence"), status: "stale" }],
      goalContract: contract(),
    });
    const report = goal(session);
    expect(report?.criteria[0]?.status).toBe("stale");
    expect(report?.status).toBe("UNDETERMINED");
  });

  it("treats incomplete observation as UNDETERMINED", () => {
    const report = goal(
      baseSession({ current: revision({ complete: false }), goalContract: contract() }),
    );
    expect(report?.status).toBe("UNDETERMINED");
    expect(report?.blockers.some((blocker) => blocker.kind === "observation")).toBe(true);
  });

  it("never satisfies a review-only MUST criterion", () => {
    const review = criterion({ assertion: "review-only", requiredLevel: 0 });
    const report = goal(
      baseSession({
        nodes: [
          {
            id: "obligation",
            version: 1,
            kind: "ProofObligation",
            statement: "Reviewed manually",
            severity: "CRITICAL",
            minimumLevel: 0,
            dependsOn: [],
            provenance: "user",
            action: null,
          },
          {
            id: "requirement",
            version: 1,
            kind: "Requirement",
            statement: "Reviewed",
            severity: "CRITICAL",
            minimumLevel: 0,
            dependsOn: ["obligation"],
            provenance: "user",
            action: null,
          },
        ],
        evidence: [],
        goalContract: contract({ criteria: [review] }),
      }),
    );
    expect(report?.status).toBe("UNDETERMINED");
  });

  it("detects structural contradictory assertions without guessing", () => {
    const present = criterion({
      id: "present",
      key: "present",
      assertion: "literal-presence",
      evidenceKinds: ["text-present"],
      obligationIds: ["obligation"],
    });
    const absent = criterion({
      id: "absent",
      key: "absent",
      assertion: "literal-absence",
      evidenceKinds: ["text-absent"],
      obligationIds: ["obligation"],
    });
    const report = goal(
      baseSession({
        goalContract: contract({
          criteria: [present, absent],
          desiredOutcomes: [
            {
              id: "outcome",
              key: "absent",
              statement: "Absent",
              priority: "MUST",
              criterionIds: ["present", "absent"],
              provenance: "user",
            },
          ],
        }),
      }),
    );
    expect(
      report?.conflicts?.some((conflict) => conflict.kind === "contradictory-assertions"),
    ).toBe(true);
    expect(report?.status).toBe("UNSATISFIED");
  });

  it("detects a weakened adopted criterion as drift", () => {
    const previous = contract({
      version: 1,
      criteria: [criterion({ requiredLevel: 2 })],
    });
    const current = contract({
      version: 2,
      criteria: [criterion({ version: 2, requiredLevel: 1 })],
    });
    const report = goal(
      baseSession({
        goalContract: current,
        goalContractHistory: [previous],
      }),
    );
    expect(report?.drifts?.some((drift) => drift.kind === "criterion-weakened")).toBe(true);
    expect(report?.status).toBe("UNSATISFIED");
  });

  it("exposes only discrete statuses and counts, never a score", () => {
    const report = goal(baseSession({ goalContract: contract() }));
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("percentage");
    expect(serialized).not.toContain("confidence");
    expect(serialized).not.toContain('"score"');
    expect(Object.keys(report ?? {})).not.toContain("score");
  });

  it("does not treat a test without investigated scope as sufficient", () => {
    expect(
      assessAdequacy("test-suite-passes", "test", 3, { scope: ["src"], investigatedPaths: [] }),
    ).toBe("partial");
    expect(
      assessAdequacy("test-suite-passes", "test", 3, {
        scope: ["src"],
        investigatedPaths: ["src/a.ts"],
      }),
    ).toBe("sufficient");
  });

  it("returns unknown for a symbol predicate outside the TS family", () => {
    const symbol = criterion({
      assertion: "symbol-presence",
      evidenceKinds: ["symbol-exists"],
    });
    const session = baseSession({
      current: revision({ artifacts: [artifact("src/a.py")] }),
      nodes: [
        {
          id: "obligation",
          version: 1,
          kind: "ProofObligation",
          statement: "Symbol exists",
          severity: "CRITICAL",
          minimumLevel: 1,
          dependsOn: [],
          provenance: "user",
          action: { kind: "symbol-exists", paths: ["src"], target: "Thing" },
        },
        {
          id: "requirement",
          version: 1,
          kind: "Requirement",
          statement: "Symbol",
          severity: "CRITICAL",
          minimumLevel: 1,
          dependsOn: ["obligation"],
          provenance: "user",
          action: null,
        },
      ],
      evidence: [
        {
          ...required(baseSession().evidence[0], "evidence"),
          outcomeKind: "symbol-exists",
        },
      ],
      goalContract: contract({ criteria: [symbol] }),
    });
    expect(goal(session)?.criteria[0]?.status).toBe("unknown");
  });

  it("reports an unlinked criterion and a staged draft as separate intent debt", () => {
    const proposedGoal: GoalContractDraft = {
      schemaVersion: 1,
      goal: "Absent literal",
      desiredOutcomes: [
        {
          key: "absent",
          statement: "Absent",
          priority: "MUST",
          criterionKeys: ["criterion"],
        },
      ],
      criteria: [
        {
          key: "criterion",
          statement: "The literal is absent from the declared scope.",
          assertion: "literal-absence",
          outcomeKeys: ["absent"],
          evidenceKinds: ["text-absent"],
        },
      ],
      preserveCandidates: [],
      forbiddenCandidates: [],
      nonGoals: [],
      openQuestions: [],
      limitations: [],
    };
    const report = goal(
      baseSession({
        goalContract: contract({
          criteria: [criterion({ obligationIds: [] })],
        }),
        proposedGoal,
      }),
    );
    expect(report?.intentDebt.some((item) => item.kind === "missing-criterion")).toBe(true);
    expect(report?.intentDebt.some((item) => item.kind === "unadopted-draft")).toBe(true);
    expect(report?.status).toBe("UNDETERMINED");
  });

  it("surfaces an uninvestigated goal blindspot as coverage debt", () => {
    const report = goal(
      baseSession({
        current: revision({
          artifacts: [artifact("src/a.ts", "two"), artifact("src/b.ts")],
        }),
        investigationRules: [
          {
            triggerPaths: ["src/a.ts"],
            expectedPaths: ["src/b.ts"],
            reason: "A semantic change requires inspecting its consumer.",
          },
        ],
        goalContract: contract(),
      }),
    );
    expect(report?.coverage.artifacts.blindspots).toBe(1);
    expect(report?.blindspots?.[0]?.artifact).toBe("src/b.ts");
    expect(report?.status).toBe("UNDETERMINED");
    expect(report?.intentDebt.some((item) => item.kind === "inadequate-evidence")).toBe(true);
  });

  it("keeps passing test commands in test status without promoting them to a goal status", () => {
    const testNode = {
      id: "test-node",
      version: 1,
      kind: "ProofObligation" as const,
      statement: "Run the approved tests",
      severity: "CRITICAL" as const,
      minimumLevel: 3 as const,
      dependsOn: [],
      provenance: "user" as const,
      action: { kind: "command" as const, paths: ["."], target: "test" },
    };
    const report = goal(
      baseSession({
        nodes: [
          testNode,
          { ...required(baseSession().nodes[1], "requirement node"), dependsOn: ["test-node"] },
        ],
        evidence: [
          {
            ...required(baseSession().evidence[0], "evidence"),
            nodeId: "test-node",
            level: 3,
            outcomeKind: "test",
            investigatedPaths: ["src/a.ts"],
          },
        ],
        goalContract: contract({
          criteria: [
            criterion({
              statement: "The behavior is reviewed only.",
              assertion: "review-only",
              requiredLevel: 0,
              obligationIds: ["test-node"],
              evidenceKinds: ["manual-review"],
            }),
          ],
        }),
      }),
    );
    expect(report?.testStatus.outcome).toBe("passing");
    expect(report?.testStatus.commands[0]).toMatchObject({ key: "test", level: 3, result: "pass" });
    expect(report?.status).toBe("UNDETERMINED");
  });

  it("uses the latest evidence per node so old failures cannot poison a re-verification", () => {
    const base = baseSession();
    const oldFailure = {
      ...required(base.evidence[0], "base evidence"),
      id: "old-failure",
      result: "fail" as const,
      status: "stale" as const,
    };
    const report = goal(
      baseSession({
        evidence: [oldFailure, required(base.evidence[0], "base evidence")],
        goalContract: contract(),
      }),
    );
    expect(report?.criteria[0]?.status).toBe("supported");
    expect(report?.status).toBe("SATISFIED");
  });

  it("propagates a contradicted dependency regardless of criterion declaration order", () => {
    const base = baseSession();
    const node = (id: string): ChangeSession["nodes"][number] => ({
      ...required(base.nodes[0], "base node"),
      id,
      version: 1,
    });
    const evidence = (id: string, nodeId: string, result: "pass" | "fail") => ({
      ...required(base.evidence[0], "base evidence"),
      id,
      nodeId,
      result,
    });
    const report = goal(
      baseSession({
        nodes: [
          node("a-node"),
          node("b-node"),
          node("c-node"),
          required(base.nodes[1], "requirement node"),
        ],
        evidence: [
          evidence("a-evidence", "a-node", "pass"),
          evidence("b-evidence", "b-node", "pass"),
          evidence("c-evidence", "c-node", "fail"),
        ],
        goalContract: contract({
          desiredOutcomes: [
            {
              ...required(contract().desiredOutcomes[0], "desired outcome"),
              criterionIds: ["A", "B", "C"],
            },
          ],
          criteria: [
            criterion({ id: "A", key: "a", dependsOn: ["B"], obligationIds: ["a-node"] }),
            criterion({ id: "B", key: "b", dependsOn: ["C"], obligationIds: ["b-node"] }),
            criterion({ id: "C", key: "c", dependsOn: [], obligationIds: ["c-node"] }),
          ],
        }),
      }),
    );
    expect(report?.criteria.find((item) => item.criterionId === "C")?.status).toBe("contradicted");
    expect(report?.criteria.find((item) => item.criterionId === "B")?.status).toBe("contradicted");
    expect(report?.criteria.find((item) => item.criterionId === "A")?.status).toBe("contradicted");
  });

  it("is deterministic for identical input", () => {
    const session = baseSession({ goalContract: contract() });
    expect(JSON.stringify(evaluateGoalSatisfaction(session, evaluateProof(session)))).toBe(
      JSON.stringify(evaluateGoalSatisfaction(session, evaluateProof(session))),
    );
  });
});
