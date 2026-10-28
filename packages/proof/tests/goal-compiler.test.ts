import type { ProviderPort } from "@prof-bilal/atlas-core";
import { fail, ok } from "@prof-bilal/atlas-shared";
import { describe, expect, it } from "vitest";
import { parseGoalDraft, proposeGoalDraft } from "../src/goal-compiler";

function validDraft() {
  return {
    schemaVersion: 1,
    goal: "Remove literal JWT references",
    desiredOutcomes: [
      {
        key: "no-jwt",
        statement: "No literal JWT reference remains",
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
    limitations: ["Model-proposed interpretation."],
  };
}

function provider(content: string): ProviderPort {
  return {
    complete: async () =>
      ok({
        provider: "fixture",
        model: "fixture",
        usage: undefined,
        toolCalls: undefined,
        content,
      }),
  };
}

describe("goal draft compiler", () => {
  it("normalizes a strictly shaped draft", () => {
    const draft = parseGoalDraft(validDraft());
    expect(draft.schemaVersion).toBe(1);
    expect(draft.desiredOutcomes[0]?.priority).toBe("MUST");
    expect(draft.criteria[0]?.assertion).toBe("literal-absence");
    expect(draft.criteria[0]?.evidenceKinds).toEqual(["text-absent"]);
  });

  it("rejects unknown top-level and criterion fields", () => {
    expect(() => parseGoalDraft({ ...validDraft(), approved: true })).toThrow(
      "Unsafe goal draft fields.",
    );
    expect(() =>
      parseGoalDraft({
        ...validDraft(),
        criteria: [{ ...validDraft().criteria[0], action: { kind: "command" } }],
      }),
    ).toThrow("Unsafe goal criterion fields.");
    expect(() =>
      parseGoalDraft({
        ...validDraft(),
        criteria: [{ ...validDraft().criteria[0], minimumLevel: 5, severity: "CRITICAL" }],
      }),
    ).toThrow("Unsafe goal criterion fields.");
  });

  it("rejects unknown references and dependency cycles", () => {
    expect(() =>
      parseGoalDraft({
        ...validDraft(),
        desiredOutcomes: [{ ...validDraft().desiredOutcomes[0], criterionKeys: ["missing"] }],
      }),
    ).toThrow("unknown criterion");
    expect(() =>
      parseGoalDraft({
        ...validDraft(),
        criteria: [
          {
            ...validDraft().criteria[0],
            key: "one",
            dependsOn: ["two"],
          },
          {
            ...validDraft().criteria[0],
            key: "two",
            dependsOn: ["one"],
          },
        ],
        desiredOutcomes: [
          {
            ...validDraft().desiredOutcomes[0],
            criterionKeys: ["one", "two"],
          },
        ],
      }),
    ).toThrow("must be acyclic");
  });

  it("rejects duplicate keys, oversized drafts and unbounded strings", () => {
    expect(() =>
      parseGoalDraft({
        ...validDraft(),
        criteria: [validDraft().criteria[0], validDraft().criteria[0]],
      }),
    ).toThrow("Duplicate goal criterion key.");
    expect(() =>
      parseGoalDraft({
        ...validDraft(),
        criteria: Array.from({ length: 65 }, (_, index) => ({
          ...validDraft().criteria[0],
          key: `criterion-${index}`,
        })),
      }),
    ).toThrow("Invalid goal criterion count.");
    expect(() =>
      parseGoalDraft({
        ...validDraft(),
        goal: "x".repeat(10001),
      }),
    ).toThrow("Invalid goal draft statement.");
  });

  it("rejects unsafe paths and unbounded open questions", () => {
    expect(() =>
      parseGoalDraft({
        ...validDraft(),
        preserveCandidates: [{ artifact: "../outside.ts", contractId: "api" }],
      }),
    ).toThrow("Invalid repository-relative scope.");
    expect(() =>
      parseGoalDraft({
        ...validDraft(),
        openQuestions: [
          {
            question: "Which token format?",
            options: ["one"],
            blocks: [],
          },
        ],
      }),
    ).toThrow("Invalid open question options.");
  });

  it("asks a provider for JSON and returns a validated draft", async () => {
    let request: Record<string, unknown> | undefined;
    const draft = await proposeGoalDraft(
      {
        complete: async (value) => {
          request = value as unknown as Record<string, unknown>;
          return ok({
            provider: "fixture",
            model: "fixture",
            usage: undefined,
            toolCalls: undefined,
            content: JSON.stringify({ draft: validDraft() }),
          });
        },
      },
      "repository context",
    );

    expect(draft.criteria[0]?.key).toBe("absence");
    expect(request?.["json"]).toBe(true);
    expect(request?.["temperature"]).toBe(0);
  });

  it("rejects malformed provider output without staging anything", async () => {
    await expect(proposeGoalDraft(provider("not json"), "context")).rejects.toThrow("invalid JSON");
    await expect(
      proposeGoalDraft(provider(JSON.stringify({ draft: validDraft(), extra: true })), "context"),
    ).rejects.toThrow("Invalid goal proposal envelope.");
    await expect(
      proposeGoalDraft(
        provider(JSON.stringify({ draft: { ...validDraft(), goal: "" } })),
        "context",
      ),
    ).rejects.toThrow("Invalid goal draft statement.");
    await expect(
      proposeGoalDraft(
        {
          complete: async () => fail(new Error("provider down")),
        },
        "context",
      ),
    ).rejects.toThrow("Goal proposal provider failed.");
  });
});
