import type { GoalContract, ProofProposal, RepositoryRevision } from "@prof-bilal/atlas-core";
import { ProofStore } from "@prof-bilal/atlas-storage";
import { afterEach, describe, expect, it } from "vitest";
import { createProofEngine, projectGoalCoverage } from "../src/index";

const stores: ProofStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

function harness() {
  const store = new ProofStore();
  stores.push(store);
  const revision: RepositoryRevision = {
    id: "r1",
    repositoryId: "repo",
    head: null,
    observedAt: "now",
    complete: true,
    artifacts: [{ id: "a", path: "src/a.ts", hash: "one" }],
    dependencies: [],
    limitations: [],
  };
  return createProofEngine(store, {
    observe: async () => revision,
    execute: async () => ({ result: "pass", level: 1, detail: "absence check" }),
  });
}

function contract(): GoalContract {
  return {
    schemaVersion: 1,
    id: "contract-1",
    version: 1,
    goal: "Remove literal JWT references",
    desiredOutcomes: [
      {
        id: "outcome-1",
        key: "no-jwt",
        statement: "No literal JWT reference remains",
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
        adoptedAtRevision: "r1",
        obligationIds: [],
        evidenceKinds: ["text-absent"],
      },
    ],
    preserveContracts: [],
    forbiddenOutcomes: [],
    nonGoals: [],
    openDecisions: [],
    boundary: ["."],
    authorizedPaths: [],
    adoptedAtRevision: "r1",
    provenance: "user",
  };
}

const draft = {
  schemaVersion: 1 as const,
  goal: "Remove literal JWT references",
  desiredOutcomes: [
    {
      key: "no-jwt",
      statement: "No literal JWT reference remains",
      priority: "MUST" as const,
      criterionKeys: ["absence"],
    },
  ],
  criteria: [
    {
      key: "absence",
      statement: "Literal JWT is absent from src",
      assertion: "literal-absence" as const,
      outcomeKeys: ["no-jwt"],
      evidenceKinds: ["text-absent" as const],
    },
  ],
  preserveCandidates: [],
  forbiddenCandidates: [],
  nonGoals: [],
  openQuestions: [],
  limitations: [],
};

describe("goal coverage projection", () => {
  it("returns an empty projection when no contract is adopted", async () => {
    const engine = harness();
    const report = await engine.begin({ goal: "No goal contract yet" });
    expect(projectGoalCoverage(report.session)).toEqual({ nodes: [], edges: [], gaps: [] });
  });

  it("projects outcomes, criteria, linked obligations and evidence without duplicates", async () => {
    const engine = harness();
    const proposals: ProofProposal[] = [
      {
        key: "absence",
        kind: "ProofObligation",
        statement: "Literal JWT is absent",
        action: { kind: "text-absent", paths: ["."], target: "JWT" },
        minimumLevel: 1,
      },
    ];
    const began = await engine.begin({ goal: "Remove literal JWT references", proposals });
    const obligation = began.session.nodes.find((node) => node.kind === "ProofObligation");
    if (!obligation) throw new Error("fixture is missing its proof obligation");
    await engine.verify(began.session.id, obligation.id);
    await engine.stageGoalDraft(began.session.id, draft);
    const adopted = await engine.adoptGoalContract(began.session.id, {
      approved: true,
      criterionKeys: ["absence"],
    });
    const graph = projectGoalCoverage(adopted.session);

    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(graph.nodes.length);
    expect(new Set(graph.edges.map((edge) => `${edge.from}|${edge.to}|${edge.kind}`)).size).toBe(
      graph.edges.length,
    );
    expect(graph.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining([
        "Goal",
        "DesiredOutcome",
        "AcceptanceCriterion",
        "ProofObligation",
        "Evidence",
      ]),
    );
    expect(graph.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["requires", "verified_by", "evidenced_by"]),
    );
    expect(graph.gaps).toEqual([]);
    expect(projectGoalCoverage(adopted.session)).toEqual(graph);
  });

  it("reports a gap when a criterion has no linked obligation", async () => {
    const engine = harness();
    const report = await engine.begin({ goal: "No JWT", goalContract: contract() });
    const graph = projectGoalCoverage(report.session);

    expect(graph.gaps).toEqual([
      { criterionId: "criterion-1", missing: "No linked proof obligation." },
    ]);
  });

  it("projects preserve, forbidden, non-goal and decision nodes", async () => {
    const engine = harness();
    const base = contract();
    const full: GoalContract = {
      ...base,
      preserveContracts: [
        {
          id: "preserve-1",
          artifact: "src/a.ts",
          contractId: "api",
          name: "api",
          baselineHash: "hash",
          severity: "HIGH",
          provenance: "user",
          obligationIds: [],
        },
      ],
      forbiddenOutcomes: [
        {
          id: "forbidden-1",
          statement: "No secret file",
          detector: { kind: "artifact-exists", paths: ["src"], target: "secret" },
          severity: "CRITICAL",
          provenance: "user",
        },
      ],
      nonGoals: [
        {
          id: "non-goal-1",
          statement: "Do not change docs",
          reason: "Out of scope.",
          paths: ["docs"],
        },
      ],
      openDecisions: [
        {
          id: "decision-1",
          question: "Keep legacy tokens?",
          options: ["yes", "no"],
          status: "open",
          blocking: true,
          blocks: ["criterion-1"],
        },
      ],
    };
    const report = await engine.begin({ goal: "No JWT", goalContract: full });
    const graph = projectGoalCoverage(report.session);

    expect(graph.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining([
        "PreserveContract",
        "RepositoryArtifact",
        "ForbiddenOutcome",
        "NonGoal",
        "OpenDecision",
      ]),
    );
    expect(graph.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["preserves", "affects", "forbids", "excludes", "decides"]),
    );
  });

  it("fails closed when a criterion links an unknown obligation", async () => {
    const engine = harness();
    const base = contract();
    const broken: GoalContract = {
      ...base,
      criteria: base.criteria.map((criterion) => ({
        ...criterion,
        obligationIds: ["missing-node"],
      })),
    };
    const report = await engine.begin({ goal: "No JWT", goalContract: broken });

    expect(() => projectGoalCoverage(report.session)).toThrow(
      "Goal criterion references an unknown proof obligation.",
    );
  });
});
