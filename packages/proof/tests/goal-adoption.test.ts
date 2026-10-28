import type { GoalContractDraft, ProofProposal, RepositoryRevision } from "@prof-bilal/atlas-core";
import { ProofStore } from "@prof-bilal/atlas-storage";
import { afterEach, describe, expect, it } from "vitest";
import { createProofEngine } from "../src/index";

const stores: ProofStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Expected ${name}`);
  return value;
}

function harness(contracts?: RepositoryRevision["artifacts"][number]["contracts"]) {
  const store = new ProofStore();
  stores.push(store);
  let revision: RepositoryRevision = {
    id: "r1",
    repositoryId: "repo",
    head: null,
    observedAt: "now",
    complete: true,
    artifacts: [
      {
        id: "a",
        path: "src/a.ts",
        hash: "one",
        ...(contracts ? { contracts } : {}),
      },
    ],
    dependencies: [],
    limitations: [],
  };
  const engine = createProofEngine(store, {
    observe: async () => revision,
    execute: async () => ({ result: "pass", level: 1, detail: "deterministic absence check" }),
  });
  return {
    engine,
    change(patch: Partial<RepositoryRevision>) {
      revision = { ...revision, ...patch };
    },
  };
}

function draft(): GoalContractDraft {
  return {
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
    limitations: ["Model-proposed interpretation; adoption is required."],
  };
}

async function staged(h: ReturnType<typeof harness>) {
  const report = await h.engine.begin({ goal: "Remove literal JWT references" });
  await h.engine.stageGoalDraft(report.session.id, draft());
  return report.session.id;
}

describe("goal draft adoption", () => {
  it("never adopts a staged draft without an explicit adoption call", async () => {
    const h = harness();
    const id = await staged(h);
    const checked = await h.engine.check(id);

    expect(checked.session.proposedGoal?.criteria[0]?.key).toBe("absence");
    expect(checked.session.goalContract).toBeUndefined();
  });

  it("adopts with deterministic identities, derived severity and proof level", async () => {
    const h = harness();
    const id = await staged(h);
    const report = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
    });
    const contract = report.session.goalContract;

    expect(contract?.version).toBe(1);
    expect(contract?.provenance).toBe("mixed");
    expect(contract?.criteria[0]?.severity).toBe("CRITICAL");
    expect(contract?.criteria[0]?.requiredLevel).toBe(1);
    expect(contract?.criteria[0]?.outcomeIds[0]).toBe(contract?.desiredOutcomes[0]?.id);
    expect(report.session.proposedGoal).toBeUndefined();
  });

  it("requires explicit approval and a non-empty bounded criterion selection", async () => {
    const h = harness();
    const id = await staged(h);

    await expect(
      h.engine.adoptGoalContract(id, { approved: false, criterionKeys: ["absence"] }),
    ).rejects.toThrow("explicit approval");
    await expect(
      h.engine.adoptGoalContract(id, { approved: true, criterionKeys: [] }),
    ).rejects.toThrow("bounded criterion keys");
    await expect(
      h.engine.adoptGoalContract(id, { approved: true, criterionKeys: ["missing"] }),
    ).rejects.toThrow("not in the staged draft");
  });

  it("stales existing evidence when intent is adopted", async () => {
    const h = harness();
    const proposals: ProofProposal[] = [
      {
        key: "absence",
        kind: "ProofObligation",
        statement: "Literal JWT is absent",
        action: { kind: "text-absent", paths: ["."], target: "JWT" },
        minimumLevel: 1,
      },
      {
        key: "goal",
        kind: "Requirement",
        statement: "No JWT",
        minimumLevel: 1,
        dependsOn: ["absence"],
      },
    ];
    const began = await h.engine.begin({ goal: "No JWT", proposals });
    const verified = await h.engine.verify(began.session.id, began.session.nodes[0].id);
    expect(verified.session.evidence[0]?.status).toBe("fresh");

    await h.engine.stageGoalDraft(began.session.id, draft());
    const adopted = await h.engine.adoptGoalContract(began.session.id, {
      approved: true,
      criterionKeys: ["absence"],
    });

    expect(adopted.session.evidence.length).toBeGreaterThan(0);
    expect(adopted.session.evidence.every((item) => item.status === "stale")).toBe(true);
    expect(adopted.session.evidence[0]?.invalidatedBy).toContain("goal-contract-changed");
    expect(adopted.session.goalContract?.criteria[0]?.obligationIds).toContain(
      began.session.nodes[0]?.id,
    );
  });

  it("is idempotent for an identical adopted contract content", async () => {
    const h = harness();
    const id = await staged(h);
    const first = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
    });
    await h.engine.stageGoalDraft(id, draft());
    const second = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
    });

    expect(second.session.goalContract?.version).toBe(1);
    expect(second.session.goalContract?.id).toBe(first.session.goalContract?.id);
  });

  it("does not duplicate generated obligations when re-adopting identical content", async () => {
    const h = harness();
    const id = await staged(h);
    await h.engine.dismissGoalDraft(id, [{ key: "absence", reason: "Replace the draft." }]);
    const withForbidden = {
      ...draft(),
      forbiddenCandidates: [
        {
          statement: "No JWTs in source",
          detectorKind: "text-present" as const,
          target: "JWT",
          paths: ["src"],
        },
      ],
    };
    await h.engine.stageGoalDraft(id, withForbidden);
    const first = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
    });
    await h.engine.stageGoalDraft(id, withForbidden);
    const second = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
    });
    expect(new Set(second.session.nodes.map((node) => node.id)).size).toBe(
      second.session.nodes.length,
    );
    expect(second.session.nodes.length).toBe(first.session.nodes.length);

    await h.engine.stageGoalDraft(id, {
      ...withForbidden,
      forbiddenCandidates: [
        {
          statement: "No JWTs in source",
          detectorKind: "text-present" as const,
          target: "SECRET",
          paths: ["src"],
        },
      ],
    });
    const changed = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
    });
    const forbiddenId = changed.session.goalContract?.forbiddenOutcomes[0]?.obligationId;
    expect(changed.session.nodes.find((node) => node.id === forbiddenId)?.action?.target).toBe(
      "SECRET",
    );
  });

  it("dismisses a draft only with known keys and explicit bounded reasons", async () => {
    const h = harness();
    const id = await staged(h);

    await expect(
      h.engine.dismissGoalDraft(id, [{ key: "unknown", reason: "No." }]),
    ).rejects.toThrow("known keys");
    await expect(h.engine.dismissGoalDraft(id, [{ key: "absence", reason: " " }])).rejects.toThrow(
      "known keys",
    );

    const dismissed = await h.engine.dismissGoalDraft(id, [
      { key: "absence", reason: "The criterion is not falsifiable in this scope." },
    ]);
    expect(dismissed.session.proposedGoal).toBeUndefined();
    expect(dismissed.session.goalProposalDecisions?.[0]).toMatchObject({
      key: "absence",
      reason: "The criterion is not falsifiable in this scope.",
      revision: "r1",
    });
  });

  it("resolves preserve candidates against the observed baseline", async () => {
    const h = harness([{ id: "api", name: "exports", hash: "contract-hash" }]);
    const id = await staged(h);
    const candidate = {
      ...draft(),
      preserveCandidates: [{ artifact: "src/a.ts", contractId: "api", name: "exports" }],
    };
    await h.engine.dismissGoalDraft(id, [{ key: "absence", reason: "Replace the draft." }]);
    await h.engine.stageGoalDraft(id, candidate);
    const report = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
    });

    expect(report.session.goalContract?.preserveContracts[0]).toMatchObject({
      artifact: "src/a.ts",
      contractId: "api",
      name: "exports",
      baselineHash: "contract-hash",
      severity: "CRITICAL",
    });
  });

  it("fails closed when a preserve candidate is not observed", async () => {
    const h = harness();
    const id = await staged(h);
    await h.engine.dismissGoalDraft(id, [{ key: "absence", reason: "Replace the draft." }]);
    await h.engine.stageGoalDraft(id, {
      ...draft(),
      preserveCandidates: [{ artifact: "src/missing.ts", contractId: "api" }],
    });

    await expect(
      h.engine.adoptGoalContract(id, { approved: true, criterionKeys: ["absence"] }),
    ).rejects.toThrow("not observed in the baseline");
  });

  it("records decisions for open questions and maps their blocked items", async () => {
    const h = harness();
    const id = await staged(h);
    await h.engine.dismissGoalDraft(id, [{ key: "absence", reason: "Replace the draft." }]);
    await h.engine.stageGoalDraft(id, {
      ...draft(),
      openQuestions: [
        {
          question: "May legacy tokens remain accepted?",
          options: ["yes", "no"],
          blocks: ["no-jwt", "absence"],
        },
      ],
    });
    const report = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
      decisions: [{ key: "May legacy tokens remain accepted?", reason: "No; remove them." }],
    });
    const contract = report.session.goalContract;
    const decision = contract?.openDecisions[0];

    expect(decision?.status).toBe("decided");
    expect(decision?.decision).toBe("No; remove them.");
    expect(decision?.blocking).toBe(true);
    expect(decision?.blocks).toContain(contract?.desiredOutcomes[0]?.id);
    expect(decision?.blocks).toContain(contract?.criteria[0]?.id);
  });

  it("adopts supported read-only forbidden detectors and materializes a falsifier", async () => {
    const h = harness();
    const id = await staged(h);
    await h.engine.dismissGoalDraft(id, [{ key: "absence", reason: "Replace the draft." }]);
    await h.engine.stageGoalDraft(id, {
      ...draft(),
      forbiddenCandidates: [
        {
          statement: "No JWTs in source",
          detectorKind: "text-present",
          target: "JWT",
          paths: ["src"],
        },
      ],
    });

    const report = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
    });
    expect(report.session.goalContract?.forbiddenOutcomes[0]?.detector).toMatchObject({
      kind: "text-present",
      target: "JWT",
      paths: ["src"],
    });
    expect(
      report.session.nodes.some(
        (node) =>
          node.id === report.session.goalContract?.forbiddenOutcomes[0]?.obligationId &&
          node.action?.kind === "text-present",
      ),
    ).toBe(true);
  });

  it("verifies a materialized forbidden detector and reflects it in goal status", async () => {
    const h = harness();
    const id = await staged(h);
    await h.engine.dismissGoalDraft(id, [{ key: "absence", reason: "Replace the draft." }]);
    await h.engine.stageGoalDraft(id, {
      ...draft(),
      forbiddenCandidates: [
        {
          statement: "No JWTs in source",
          detectorKind: "text-present",
          target: "JWT",
          paths: ["src"],
        },
      ],
    });
    const adopted = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
    });
    const forbiddenId = required(
      adopted.session.goalContract?.forbiddenOutcomes[0]?.obligationId,
      "forbidden obligation",
    );
    const verified = await h.engine.verify(id, forbiddenId);
    expect(verified.session.evidence.some((item) => item.nodeId === forbiddenId)).toBe(true);
    expect(verified.goal?.coverage.forbiddenOutcomes.detected).toBe(1);
    expect(verified.goal?.status).toBe("UNSATISFIED");
  });

  it("materializes a preserve obligation that can be verified independently", async () => {
    const h = harness([{ id: "api", name: "exports", hash: "contract-hash" }]);
    const id = await staged(h);
    await h.engine.dismissGoalDraft(id, [{ key: "absence", reason: "Replace the draft." }]);
    await h.engine.stageGoalDraft(id, {
      ...draft(),
      preserveCandidates: [{ artifact: "src/a.ts", contractId: "api", name: "exports" }],
    });
    const adopted = await h.engine.adoptGoalContract(id, {
      approved: true,
      criterionKeys: ["absence"],
    });
    const preserveId = required(
      adopted.session.goalContract?.preserveContracts[0]?.obligationIds[0],
      "preserve obligation",
    );
    expect(adopted.session.nodes.some((node) => node.id === preserveId)).toBe(true);
    const verified = await h.engine.verify(id, preserveId);
    expect(verified.goal?.coverage.preserveContracts.verified).toBe(1);
  });

  it("rejects model fields that would smuggle execution or proof decisions", async () => {
    const h = harness();
    const report = await h.engine.begin({ goal: "No JWT" });
    const unsafe = {
      ...draft(),
      criteria: [
        {
          ...draft().criteria[0],
          action: { kind: "command", target: "test" },
          minimumLevel: 5,
        },
      ],
    } as unknown as GoalContractDraft;

    await expect(h.engine.stageGoalDraft(report.session.id, unsafe)).rejects.toThrow(
      "Unsafe goal criterion fields.",
    );
  });
});
