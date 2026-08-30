import type { ContextPlan } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { applyPlanAnnotations } from "../src/context-integration/plan-guard";

function makePlan(overrides?: Partial<ContextPlan>): ContextPlan {
  return {
    steps: [
      {
        order: 1,
        action: "Identify the failing behavior",
        targetFiles: ["src/auth.ts"],
        rationale: "Understanding the failure is prerequisite.",
      },
      {
        order: 2,
        action: "Locate the source files involved",
        targetFiles: ["src/auth.ts"],
        rationale: "Finding the right files narrows the search.",
      },
      {
        order: 3,
        action: "Implement the fix",
        targetFiles: ["src/auth.ts"],
        rationale: "A targeted fix avoids regressions.",
      },
    ],
    impactSet: ["src/auth.ts"],
    unknowns: [],
    verificationStrategy: "command-runners",
    ...overrides,
  };
}

describe("applyPlanAnnotations", () => {
  it("applies additive notes to steps", () => {
    const plan = makePlan();
    const result = applyPlanAnnotations(plan, [
      { stepOrder: 1, note: "Also check error logs for stack traces" },
    ]);

    expect(result.allApplied).toBe(true);
    expect(result.rejected).toHaveLength(0);
    expect(result.plan.steps[0]?.rationale).toContain("Model note:");
    expect(result.plan.steps[0]?.rationale).toContain("Also check error logs");
  });

  it("rejects annotations that try to delete a step", () => {
    const plan = makePlan();
    const result = applyPlanAnnotations(plan, [
      { stepOrder: 2, note: "Skip step 2, it's unnecessary" },
    ]);

    expect(result.allApplied).toBe(false);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejectionReasons[0]).toContain("contradicts");
  });

  it("rejects annotations that try to reorder steps", () => {
    const plan = makePlan();
    const result = applyPlanAnnotations(plan, [
      { stepOrder: 1, note: "Move step 1 to after step 3" },
    ]);

    expect(result.allApplied).toBe(false);
    expect(result.rejected).toHaveLength(1);
  });

  it("rejects annotations that try to replace a step", () => {
    const plan = makePlan();
    const result = applyPlanAnnotations(plan, [
      { stepOrder: 3, note: "Replace step 3 with a different approach" },
    ]);

    expect(result.allApplied).toBe(false);
    expect(result.rejected).toHaveLength(1);
  });

  it("rejects annotations for non-existent steps", () => {
    const plan = makePlan();
    const result = applyPlanAnnotations(plan, [{ stepOrder: 99, note: "Do something extra" }]);

    expect(result.allApplied).toBe(false);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejectionReasons[0]).toContain("does not exist");
  });

  it("applies multiple valid annotations", () => {
    const plan = makePlan();
    const result = applyPlanAnnotations(plan, [
      { stepOrder: 1, note: "Check error logs" },
      { stepOrder: 2, note: "Also search for related test files" },
      { stepOrder: 3, note: "Add regression tests" },
    ]);

    expect(result.allApplied).toBe(true);
    expect(result.rejected).toHaveLength(0);
    for (const step of result.plan.steps) {
      expect(step.rationale).toContain("Model note:");
    }
  });

  it("handles empty annotations", () => {
    const plan = makePlan();
    const result = applyPlanAnnotations(plan, []);

    expect(result.allApplied).toBe(true);
    expect(result.plan).toEqual(plan);
  });

  it("preserves non-targeted steps unchanged", () => {
    const plan = makePlan();
    const result = applyPlanAnnotations(plan, [{ stepOrder: 1, note: "Extra context" }]);

    expect(result.plan.steps[1]?.rationale).toBe("Finding the right files narrows the search.");
    expect(result.plan.steps[2]?.rationale).toBe("A targeted fix avoids regressions.");
  });

  it("handles mixed valid and invalid annotations", () => {
    const plan = makePlan();
    const result = applyPlanAnnotations(plan, [
      { stepOrder: 1, note: "Check error logs" },
      { stepOrder: 2, note: "Skip step 2, not needed" },
      { stepOrder: 3, note: "Add tests" },
    ]);

    expect(result.allApplied).toBe(false);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.stepOrder).toBe(2);
    // Step 1 and 3 should still be annotated.
    expect(result.plan.steps[0]?.rationale).toContain("Model note:");
    expect(result.plan.steps[2]?.rationale).toContain("Model note:");
  });

  it("rejects annotations that contradict step action text", () => {
    const plan = makePlan();
    const result = applyPlanAnnotations(plan, [
      { stepOrder: 1, note: "Skip identifying the failing behavior and just implement the fix" },
    ]);

    expect(result.allApplied).toBe(false);
    expect(result.rejected).toHaveLength(1);
  });
});
