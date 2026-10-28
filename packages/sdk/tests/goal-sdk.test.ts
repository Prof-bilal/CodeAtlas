import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok } from "@prof-bilal/atlas-shared";
import { afterEach, describe, expect, it } from "vitest";
import { type ProofSDK, createProofSDK } from "../src/proof";
import { createUsageService } from "../src/usage";

const roots: string[] = [];
const engines: ProofSDK[] = [];
afterEach(async () => {
  for (const sdk of engines.splice(0)) sdk.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Expected ${name}`);
  return value;
}

function goalProvider() {
  return {
    complete: async () =>
      ok({
        provider: "fixture",
        model: "fixture",
        usage: undefined,
        toolCalls: undefined,
        content: JSON.stringify({
          draft: {
            goal: "Keep the exported value",
            desiredOutcomes: [
              {
                key: "value",
                statement: "The exported value remains",
                priority: "MUST",
                criterionKeys: ["presence"],
              },
            ],
            criteria: [
              {
                key: "presence",
                statement: "The exported value is present",
                assertion: "literal-presence",
                outcomeKeys: ["value"],
                evidenceKinds: ["text-present"],
              },
            ],
            preserveCandidates: [],
            forbiddenCandidates: [],
            nonGoals: [],
            openQuestions: [],
            limitations: [],
          },
        }),
      }),
  };
}

describe("goal SDK lifecycle", () => {
  it("reaches SATISFIED only through adopted intent and fresh linked evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-goal-sdk-"));
    roots.push(root);
    await writeFile(join(root, "a.ts"), "export const value = 1;\n");
    const sdk = await createProofSDK({ repositoryPath: root });
    engines.push(sdk);
    try {
      const started = await sdk.begin({
        goal: "Keep the exported value",
        proposals: [
          {
            key: "presence",
            kind: "ProofObligation",
            statement: "Exported value literal is present",
            minimumLevel: 1,
            action: {
              kind: "text-present",
              paths: ["a.ts"],
              target: "export const value",
            },
          },
          {
            key: "goal",
            kind: "Requirement",
            statement: "Exported value remains",
            minimumLevel: 1,
            dependsOn: ["presence"],
          },
        ],
      });
      await sdk.stageGoalDraft(started.session.id, {
        schemaVersion: 1,
        goal: "Keep the exported value",
        desiredOutcomes: [
          {
            key: "value",
            statement: "The exported value remains",
            priority: "MUST",
            criterionKeys: ["presence"],
          },
        ],
        criteria: [
          {
            key: "presence",
            statement: "The exported value literal is present",
            assertion: "literal-presence",
            outcomeKeys: ["value"],
            evidenceKinds: ["text-present"],
          },
        ],
        preserveCandidates: [],
        forbiddenCandidates: [],
        nonGoals: [],
        openQuestions: [],
        limitations: [],
      });
      await sdk.adoptGoal(started.session.id, {
        approved: true,
        criterionKeys: ["presence"],
      });
      const node = required(
        started.session.nodes.find((item) => item.action?.kind === "text-present"),
        "text-present node",
      );
      await sdk.verify(started.session.id, node.id);

      const goal = await sdk.goal(started.session.id);
      expect(goal.status).toBe("SATISFIED");
      expect(goal.criteria[0]?.status).toBe("supported");
      expect(goal.differential?.status).toBe("unknown");
      expect(goal.differential?.scope).toContain("a.ts");

      const receipt = await sdk.prove(started.session.id);
      expect(receipt.completion).toBe("proven");
      expect(receipt.goalStatus).toBe("SATISFIED");
      expect(receipt.intentDebt).toEqual([]);

      const exported = await sdk.exportState(started.session.id);
      expect(exported.exportVersion).toBe(2);
      expect(exported.goalContract).toBeDefined();
      expect(exported.goalIntentDebt).toEqual([]);
      const imported = await sdk.importState(exported);
      expect(imported.session.goalContract).toBeUndefined();
      expect(imported.session.proposedGoal).toBeDefined();
      expect(imported.session.evidence).toEqual([]);
      const importedNode = required(
        imported.session.nodes.find((item) => item.action?.kind === "text-present"),
        "imported text-present node",
      );
      await sdk.adoptGoal(imported.session.id, {
        approved: true,
        criterionKeys: ["presence"],
      });
      await sdk.verify(imported.session.id, importedNode.id);
      expect((await sdk.goal(imported.session.id)).status).toBe("SATISFIED");
    } finally {
      // engines are closed by afterEach
    }
  });

  it("stages model intent without adopting it, then adopts only on an explicit call", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-goal-sdk-"));
    roots.push(root);
    await writeFile(join(root, "a.ts"), "export const value = 1;\n");
    const usage = createUsageService();
    const sdk = await createProofSDK({
      repositoryPath: root,
      proposalUsage: usage,
      proposalProvider: goalProvider(),
    });
    engines.push(sdk);
    try {
      const first = await sdk.begin({ goal: "Keep the exported value" });
      await expect(sdk.proposeGoal(first.session.id, { approved: false })).rejects.toThrow(
        "explicit approval",
      );

      const draft = await sdk.proposeGoal(first.session.id, { approved: true });
      expect(draft.criteria[0]?.key).toBe("presence");

      const staged = await sdk.check(first.session.id);
      expect(staged.session.proposedGoal?.criteria[0]?.key).toBe("presence");
      expect(staged.session.goalContract).toBeUndefined();

      const adopted = await sdk.adoptGoal(first.session.id, {
        approved: true,
        criterionKeys: ["presence"],
      });
      expect(adopted.session.goalContract?.criteria[0]?.key).toBe("presence");
      expect(adopted.session.proposedGoal).toBeUndefined();

      const graph = await sdk.goalGraph(first.session.id);
      expect(graph.nodes.map((node) => node.kind)).toEqual(
        expect.arrayContaining(["Goal", "DesiredOutcome", "AcceptanceCriterion"]),
      );
      expect(graph.gaps).toHaveLength(1);
    } finally {
      usage.close();
    }
  });
});
