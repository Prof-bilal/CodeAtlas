import type { ClaimCheckResult, ProviderPort } from "@atlas/core";
import { fail, ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CRITIC_CONFIG,
  createCritic,
  runChecklist,
} from "../src/context-integration/critic";

/** Build a passing claim check result. */
function passingClaims(): ClaimCheckResult {
  return {
    checks: [{ id: "c1", kind: "path-exists", target: "auth.ts", passed: true, detail: "exists" }],
    passed: 1,
    failed: 0,
    allPassed: true,
  };
}

/** Build a failing claim check result. */
function failingClaims(): ClaimCheckResult {
  return {
    checks: [
      { id: "c1", kind: "path-exists", target: "fake.ts", passed: false, detail: "not found" },
    ],
    passed: 0,
    failed: 1,
    allPassed: false,
  };
}

describe("runChecklist", () => {
  it("passes when all checks are satisfied", () => {
    const result = runChecklist({
      answer:
        "The fix involves modifying auth.ts to add proper password validation in the login function. The AuthService class needs updating.",
      citedPaths: ["auth.ts"],
      planTargets: ["auth.ts"],
      claimResults: passingClaims(),
    });
    expect(result.allPassed).toBe(true);
    expect(result.verdict).toBe("pass");
    expect(result.passed).toBeGreaterThanOrEqual(3);
    expect(result.failed).toBe(0);
  });

  it("fails when cited paths do not overlap with plan targets", () => {
    const result = runChecklist({
      answer: "I modified the user.ts file to fix the authentication issue.",
      citedPaths: ["user.ts"],
      planTargets: ["auth.ts"],
      claimResults: passingClaims(),
    });
    expect(result.allPassed).toBe(false);
    const pathCheck = result.items.find((i) => i.id === "path-plan-overlap");
    expect(pathCheck?.passed).toBe(false);
  });

  it("fails when plan targets are not addressed in the answer", () => {
    const result = runChecklist({
      answer: "I fixed the bug by changing a variable name.",
      citedPaths: [],
      planTargets: ["auth.ts", "login.ts"],
      claimResults: passingClaims(),
    });
    expect(result.allPassed).toBe(false);
    const coverageCheck = result.items.find((i) => i.id === "plan-coverage");
    expect(coverageCheck?.passed).toBe(false);
    expect(coverageCheck?.detail).toContain("auth.ts");
  });

  it("fails when verification claims fail", () => {
    const result = runChecklist({
      answer: "The fix is in auth.ts and addresses the login function properly.",
      citedPaths: ["auth.ts"],
      planTargets: ["auth.ts"],
      claimResults: failingClaims(),
    });
    expect(result.allPassed).toBe(false);
    const claimCheck = result.items.find((i) => i.id === "verification-claims");
    expect(claimCheck?.passed).toBe(false);
  });

  it("fails when answer is too short", () => {
    const result = runChecklist({
      answer: "Fixed.",
      citedPaths: [],
      planTargets: [],
      claimResults: passingClaims(),
    });
    expect(result.allPassed).toBe(false);
    const completeness = result.items.find((i) => i.id === "answer-completeness");
    expect(completeness?.passed).toBe(false);
  });

  it("checks output contract assertions", () => {
    const result = runChecklist({
      answer:
        "The AuthService class has been updated with proper validation. The login method now checks credentials.",
      citedPaths: [],
      planTargets: [],
      claimResults: passingClaims(),
      outputContract: [
        { kind: "contains", value: "AuthService" },
        { kind: "not-contains", value: "TODO" },
      ],
    });
    const contractCheck = result.items.find((i) => i.id === "output-contract");
    expect(contractCheck?.passed).toBe(true);
  });

  it("fails output contract when contains assertion fails", () => {
    const result = runChecklist({
      answer: "I fixed the function.",
      citedPaths: [],
      planTargets: [],
      claimResults: passingClaims(),
      outputContract: [{ kind: "contains", value: "AuthService" }],
    });
    const contractCheck = result.items.find((i) => i.id === "output-contract");
    expect(contractCheck?.passed).toBe(false);
  });

  it("returns partial verdict when some checks fail", () => {
    const result = runChecklist({
      answer: "Fixed the bug.",
      citedPaths: [],
      planTargets: ["auth.ts"],
      claimResults: passingClaims(),
    });
    expect(result.verdict).toBe("partial");
    expect(result.failed).toBeGreaterThan(0);
    expect(result.passed).toBeGreaterThan(0);
  });

  it("skips path overlap check when no plan targets", () => {
    const result = runChecklist({
      answer:
        "The fix modifies the authentication flow by adding proper validation. This addresses the core issue.",
      citedPaths: ["auth.ts"],
      planTargets: [],
      claimResults: passingClaims(),
    });
    const pathCheck = result.items.find((i) => i.id === "path-plan-overlap");
    expect(pathCheck).toBeUndefined();
  });

  it("skips verification check when no claims", () => {
    const result = runChecklist({
      answer:
        "The fix modifies the authentication flow by adding proper validation. This addresses the core issue.",
      citedPaths: [],
      planTargets: [],
      claimResults: { checks: [], passed: 0, failed: 0, allPassed: true },
    });
    const claimCheck = result.items.find((i) => i.id === "verification-claims");
    expect(claimCheck).toBeUndefined();
  });
});

describe("createCritic", () => {
  it("creates a critic with default config", () => {
    const critic = createCritic();
    expect(critic).toBeDefined();
    expect(typeof critic.check).toBe("function");
    expect(typeof critic.review).toBe("function");
  });

  it("deterministic-only mode returns review from checklist", async () => {
    const critic = createCritic(undefined, { model: "none", maxRevisions: 1 });
    const checklist = critic.check({
      answer:
        "The fix modifies auth.ts to add proper validation in the login function. This addresses the authentication issue.",
      citedPaths: ["auth.ts"],
      planTargets: ["auth.ts"],
      claimResults: passingClaims(),
    });
    const review = await critic.review(
      "The fix modifies auth.ts to add proper validation.",
      checklist,
      "Context: auth module",
    );
    expect(review.ok).toBe(true);
    if (review.ok) {
      expect(review.value.revisionRecommended).toBe(false);
      expect(review.value.issues).toEqual([]);
    }
  });

  it("deterministic-only mode flags failures", async () => {
    const critic = createCritic(undefined, { model: "none", maxRevisions: 1 });
    const checklist = critic.check({
      answer: "Fixed.",
      citedPaths: [],
      planTargets: ["auth.ts"],
      claimResults: failingClaims(),
    });
    const review = await critic.review("Fixed.", checklist, "Context: auth module");
    expect(review.ok).toBe(true);
    if (review.ok) {
      expect(review.value.revisionRecommended).toBe(true);
      expect(review.value.issues.length).toBeGreaterThan(0);
    }
  });

  it("AI mode calls provider when available", async () => {
    const mockProvider: ProviderPort = {
      complete: async () => {
        return ok({
          provider: "test",
          content: JSON.stringify({
            issues: [
              {
                severity: "warning",
                category: "completeness",
                description: "Could mention error handling",
              },
            ],
            assessment: "Good but could be more thorough",
            revisionRecommended: true,
            suggestions: ["Add error handling section"],
          }),
          model: "test-model",
          usage: undefined,
          toolCalls: undefined,
        });
      },
    };
    const critic = createCritic(mockProvider, { model: "same", maxRevisions: 1 });
    const checklist = critic.check({
      answer:
        "The fix modifies auth.ts to add proper validation. This addresses the authentication issue.",
      citedPaths: ["auth.ts"],
      planTargets: ["auth.ts"],
      claimResults: passingClaims(),
    });
    const review = await critic.review(
      "The fix modifies auth.ts to add proper validation.",
      checklist,
      "Context: auth module",
    );
    expect(review.ok).toBe(true);
    if (review.ok) {
      expect(review.value.revisionRecommended).toBe(true);
      expect(review.value.issues).toHaveLength(1);
      expect(review.value.issues[0]?.severity).toBe("warning");
      expect(review.value.suggestions).toContain("Add error handling section");
    }
  });

  it("AI mode handles provider errors gracefully", async () => {
    const failProvider: ProviderPort = {
      complete: async () => fail(new Error("connection refused")),
    };
    const critic = createCritic(failProvider, { model: "same", maxRevisions: 1 });
    const checklist = critic.check({
      answer: "Test answer that is long enough to pass the completeness check.",
      citedPaths: [],
      planTargets: [],
      claimResults: passingClaims(),
    });
    const review = await critic.review("Test answer", checklist, "Context");
    expect(review.ok).toBe(false);
  });

  it("AI mode handles malformed JSON gracefully", async () => {
    const badJsonProvider: ProviderPort = {
      complete: async () =>
        ok({
          provider: "test",
          content: "not valid json at all",
          model: "test",
          usage: undefined,
          toolCalls: undefined,
        }),
    };
    const critic = createCritic(badJsonProvider, { model: "same", maxRevisions: 1 });
    const checklist = critic.check({
      answer: "Test answer that is long enough to pass the completeness check.",
      citedPaths: [],
      planTargets: [],
      claimResults: passingClaims(),
    });
    const review = await critic.review("Test answer", checklist, "Context");
    expect(review.ok).toBe(false);
  });
});

describe("DEFAULT_CRITIC_CONFIG", () => {
  it("uses same model with 1 max revision", () => {
    expect(DEFAULT_CRITIC_CONFIG.model).toBe("same");
    expect(DEFAULT_CRITIC_CONFIG.maxRevisions).toBe(1);
  });
});
