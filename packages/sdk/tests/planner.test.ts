import type { ContextPlan, TaskClassification } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { createPlanner } from "../src/context-integration/planner";

/**
 * Minimal mock of ContextSDK for planner tests.
 *
 * The planner only uses `context.search.search()` and
 * `context.dependencies.getDependencyGraph()`. We mock these with
 * deterministic fixture data — no IO, no network.
 */
function createMockContext(options?: {
  searchPaths?: string[];
  dependencyEdges?: Array<{ from: string; to: string; kind: string }>;
}) {
  const searchPaths = options?.searchPaths ?? ["src/auth.ts", "src/user.ts"];
  const edges = options?.dependencyEdges ?? [
    { from: "n:file:src/auth.ts", to: "n:file:src/user.ts", kind: "imports" },
  ];

  return {
    search: {
      search(_query: string, _opts?: unknown) {
        return searchPaths.map((path, i) => ({
          kind: "file" as const,
          path,
          score: 10 - i,
          targetId: null,
        }));
      },
    },
    dependencies: {
      getDependencyGraph() {
        return edges.map((e, i) => ({
          id: `edge-${i}`,
          from: e.from,
          to: e.to,
          kind: e.kind,
          fromLabel: e.from,
          toLabel: e.to,
        }));
      },
    },
  };
}

function makeClassification(overrides?: Partial<TaskClassification>): TaskClassification {
  return {
    category: "debug",
    subcategory: "auth-bug",
    confidence: 0.8,
    reasoning: "Test classification",
    entities: {
      filePaths: ["src/auth.ts"],
      symbolNames: ["authenticate"],
      keywords: ["auth", "login"],
    },
    ...overrides,
  };
}

describe("createPlanner", () => {
  it("produces a plan with steps, impact set, and unknowns", () => {
    const ctx = createMockContext();
    const planner = createPlanner(ctx as never);
    const plan: ContextPlan = planner.plan("Fix the bug in src/auth.ts", makeClassification());

    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.impactSet.length).toBeGreaterThan(0);
    expect(plan.verificationStrategy).toBeDefined();
  });

  it("includes entity-extracted paths in the impact set", () => {
    const ctx = createMockContext({ searchPaths: [] });
    const planner = createPlanner(ctx as never);
    const plan = planner.plan("Fix src/auth.ts", makeClassification());

    expect(plan.impactSet).toContain("src/auth.ts");
  });

  it("expands impact set via dependency closure", () => {
    const ctx = createMockContext({
      searchPaths: ["src/auth.ts"],
      dependencyEdges: [{ from: "n:file:src/auth.ts", to: "n:file:src/user.ts", kind: "imports" }],
    });
    const planner = createPlanner(ctx as never);
    const plan = planner.plan(
      "Fix the authentication bug",
      makeClassification({ entities: { filePaths: [], symbolNames: [], keywords: ["auth"] } }),
    );

    // src/user.ts should be reached via closure from src/auth.ts
    expect(plan.impactSet.some((p) => p.includes("user.ts"))).toBe(true);
  });

  it("generates different steps per category", () => {
    const ctx = createMockContext();
    const planner = createPlanner(ctx as never);

    const debugPlan = planner.plan("Fix the crash", makeClassification({ category: "debug" }));
    const securityPlan = planner.plan(
      "Fix the vulnerability",
      makeClassification({ category: "security" }),
    );
    const understandPlan = planner.plan(
      "Explain the flow",
      makeClassification({ category: "understand" }),
    );

    // Different categories should produce different step counts or actions
    expect(debugPlan.steps.length).not.toBe(understandPlan.steps.length);
    expect(securityPlan.steps.length).toBeGreaterThan(0);
    expect(understandPlan.steps.length).toBeGreaterThan(0);
  });

  it("detects unknowns for low-confidence classifications", () => {
    const ctx = createMockContext();
    const planner = createPlanner(ctx as never);
    const plan = planner.plan(
      "Do something with the thing",
      makeClassification({ confidence: 0.2 }),
    );

    expect(plan.unknowns.length).toBeGreaterThan(0);
  });

  it("sets verification strategy based on category", () => {
    const ctx = createMockContext();
    const planner = createPlanner(ctx as never);

    const debugPlan = planner.plan("Fix", makeClassification({ category: "debug" }));
    const understandPlan = planner.plan("Explain", makeClassification({ category: "understand" }));

    expect(debugPlan.verificationStrategy).toBe("command-runners");
    expect(understandPlan.verificationStrategy).toBe("claim-checks");
  });

  it("caps impact set at MAX_IMPACT_SET (15)", () => {
    const manyPaths = Array.from({ length: 20 }, (_, i) => `src/file${i}.ts`);
    const ctx = createMockContext({ searchPaths: manyPaths });
    const planner = createPlanner(ctx as never);
    const plan = planner.plan("Fix everything", makeClassification());

    expect(plan.impactSet.length).toBeLessThanOrEqual(15);
  });

  it("caps steps at MAX_STEPS (8)", () => {
    const ctx = createMockContext();
    const planner = createPlanner(ctx as never);
    const plan = planner.plan("Fix", makeClassification({ category: "debug" }));

    expect(plan.steps.length).toBeLessThanOrEqual(8);
  });

  it("steps have sequential order", () => {
    const ctx = createMockContext();
    const planner = createPlanner(ctx as never);
    const plan = planner.plan("Fix", makeClassification());

    for (let i = 0; i < plan.steps.length; i++) {
      expect(plan.steps[i]?.order).toBe(i + 1);
    }
  });

  it("every step has action, rationale, and targetFiles", () => {
    const ctx = createMockContext();
    const planner = createPlanner(ctx as never);
    const plan = planner.plan("Fix", makeClassification());

    for (const step of plan.steps) {
      expect(step.action.length).toBeGreaterThan(0);
      expect(step.rationale.length).toBeGreaterThan(0);
      expect(Array.isArray(step.targetFiles)).toBe(true);
    }
  });

  it("returns no verification for empty impact set", () => {
    const ctx = createMockContext({ searchPaths: [] });
    const planner = createPlanner(ctx as never);
    const plan = planner.plan(
      "Fix something vague",
      makeClassification({
        entities: { filePaths: [], symbolNames: [], keywords: [] },
      }),
    );

    expect(plan.verificationStrategy).toBe("none");
  });
});
