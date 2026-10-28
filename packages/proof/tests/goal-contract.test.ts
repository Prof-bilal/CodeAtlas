import type { GoalContract, GoalContractDraft, RepositoryRevision } from "@prof-bilal/atlas-core";
import { ProofStore } from "@prof-bilal/atlas-storage";
import { afterEach, describe, expect, it } from "vitest";
import { createProofEngine } from "../src/index";

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
    execute: async () => ({ result: "pass", level: 3, detail: "test passed" }),
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
        statement: "No literal JWT reference remains in src",
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
    boundary: ["src"],
    authorizedPaths: ["src"],
    adoptedAtRevision: "r1",
    provenance: "user",
  };
}

function criterion() {
  const value = contract().criteria[0];
  if (!value) throw new Error("Test fixture is missing its criterion.");
  return value;
}

describe("goal contract session integration", () => {
  it("persists an adopted contract on the existing change session", async () => {
    const engine = harness();
    const adopted = contract();
    const report = await engine.begin({ goal: adopted.goal, goalContract: adopted });

    expect(report.session.goalContract).toEqual(adopted);
    expect(report.session.proposedGoal).toBeUndefined();
    expect((await engine.exportState(report.session.id)).goalContract).toEqual(adopted);
  });

  it("stores an unadopted draft without creating an adopted contract", async () => {
    const engine = harness();
    const draft: GoalContractDraft = {
      schemaVersion: 1,
      goal: "Remove literal JWT references",
      desiredOutcomes: [
        {
          key: "no-jwt",
          statement: "No literal JWT reference remains in src",
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
      limitations: ["Model-proposed; adoption is required."],
    };

    const report = await engine.begin({ goal: draft.goal, proposedGoal: draft });
    expect(report.session.proposedGoal).toEqual(draft);
    expect(report.session.goalContract).toBeUndefined();
  });

  it("imports adopted intent as an unadopted draft and discards local identities", async () => {
    const engine = harness();
    const adopted = contract();
    const report = await engine.begin({ goal: adopted.goal, goalContract: adopted });
    const exported = await engine.exportState(report.session.id);
    const imported = await engine.importState(exported);

    expect(imported.session.id).not.toBe(exported.id);
    expect(imported.session.goalContract).toBeUndefined();
    expect(imported.session.proposedGoal?.criteria[0]?.key).toBe("absence");
    expect(imported.session.proposedGoal?.desiredOutcomes[0]?.criterionKeys).toEqual(["absence"]);
    expect(imported.session.proposedGoal?.limitations[0]).toContain("unadopted");
  });

  it("maps imported open-decision blocks back to draft keys", async () => {
    const engine = harness();
    const adopted = {
      ...contract(),
      openDecisions: [
        {
          id: "decision-1",
          question: "May the legacy path stay?",
          options: ["yes", "no"],
          status: "open" as const,
          blocking: true,
          blocks: ["criterion-1"],
        },
      ],
    };
    const report = await engine.begin({ goal: adopted.goal, goalContract: adopted });
    const imported = await engine.importState(await engine.exportState(report.session.id));
    expect(imported.session.proposedGoal?.openQuestions[0]?.blocks).toEqual(["absence"]);
  });

  it("keeps sessions without goal intent loadable", async () => {
    const engine = harness();
    const report = await engine.begin({ goal: "Keep the existing goal only" });

    expect(report.session.goalContract).toBeUndefined();
    expect(report.session.proposedGoal).toBeUndefined();
    const imported = await engine.importState(await engine.exportState(report.session.id));
    expect(imported.session.goalContract).toBeUndefined();
    expect(imported.session.proposedGoal).toBeUndefined();
  });

  it("fails closed on unsafe paths, oversized contracts and dependency cycles", async () => {
    const engine = harness();
    const unsafe = { ...contract(), boundary: ["../outside"] };
    await expect(engine.begin({ goal: unsafe.goal, goalContract: unsafe })).rejects.toThrow(
      "Invalid repository-relative scope.",
    );

    const oversized = {
      ...contract(),
      criteria: Array.from({ length: 65 }, (_, index) => ({
        ...criterion(),
        id: `criterion-${index}`,
        key: `criterion-${index}`,
        outcomeIds: [],
      })),
    };
    await expect(engine.begin({ goal: oversized.goal, goalContract: oversized })).rejects.toThrow(
      "Goal contract limit exceeded.",
    );

    const cyclic = {
      ...contract(),
      criteria: [
        { ...criterion(), id: "criterion-1", key: "one", dependsOn: ["criterion-2"] },
        { ...criterion(), id: "criterion-2", key: "two", dependsOn: ["criterion-1"] },
      ],
    };
    await expect(engine.begin({ goal: cyclic.goal, goalContract: cyclic })).rejects.toThrow(
      "Goal criterion dependencies must be acyclic.",
    );
  });
});
