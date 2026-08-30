import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { ClaimCheckInput } from "@atlas/core";
import { beforeEach, describe, expect, it } from "vitest";
import { checkClaims, resetClaimCounter } from "../src/claims.js";

let tmpDir: string;

beforeEach(() => {
  resetClaimCounter();
  tmpDir = resolve(tmpdir(), `verifier-claims-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

function fakeDeps(
  overrides: {
    symbols?: string[];
    answer?: string;
  } = {},
) {
  return {
    resolveSymbols: async () => overrides.symbols ?? ["AuthService", "login", "double"],
    getAnswerText: () => overrides.answer ?? "The AuthService handles login.",
  };
}

describe("checkClaims", () => {
  it("returns empty checks when input has no claims", async () => {
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: [],
      planTargets: [],
    };
    const result = await checkClaims(input, tmpDir, fakeDeps());
    expect(result.checks).toHaveLength(0);
    expect(result.allPassed).toBe(true);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("detects existing paths", async () => {
    const filePath = resolve(tmpDir, "exists.ts");
    writeFileSync(filePath, "export const x = 1;");

    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: ["exists.ts"],
      citedSymbols: [],
      planTargets: [],
    };
    const result = await checkClaims(input, tmpDir, fakeDeps());
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.passed).toBe(true);
    expect(result.checks[0]?.kind).toBe("path-exists");
  });

  it("detects missing paths", async () => {
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: ["nonexistent.ts"],
      citedSymbols: [],
      planTargets: [],
    };
    const result = await checkClaims(input, tmpDir, fakeDeps());
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.passed).toBe(false);
    expect(result.checks[0]?.kind).toBe("path-exists");
  });

  it("detects existing symbols", async () => {
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: ["AuthService"],
      planTargets: [],
    };
    const result = await checkClaims(input, tmpDir, fakeDeps());
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.passed).toBe(true);
    expect(result.checks[0]?.kind).toBe("symbol-exists");
  });

  it("detects missing symbols", async () => {
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: ["NonExistent"],
      planTargets: [],
    };
    const result = await checkClaims(input, tmpDir, fakeDeps());
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.passed).toBe(false);
    expect(result.checks[0]?.kind).toBe("symbol-exists");
  });

  it("detects plan coverage", async () => {
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: [],
      planTargets: ["login"],
    };
    const result = await checkClaims(
      input,
      tmpDir,
      fakeDeps({ answer: "The AuthService handles login." }),
    );
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.passed).toBe(true);
    expect(result.checks[0]?.kind).toBe("plan-coverage");
  });

  it("detects plan coverage gaps", async () => {
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: [],
      planTargets: ["password-reset"],
    };
    const result = await checkClaims(
      input,
      tmpDir,
      fakeDeps({ answer: "The AuthService handles login." }),
    );
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.passed).toBe(false);
    expect(result.checks[0]?.kind).toBe("plan-coverage");
  });

  it("checks output contracts", async () => {
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: [],
      planTargets: [],
      outputContract: [{ kind: "contains-text", value: "AuthService" }],
    };
    const result = await checkClaims(
      input,
      tmpDir,
      fakeDeps({ answer: "The AuthService handles login." }),
    );
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.passed).toBe(true);
    expect(result.checks[0]?.kind).toBe("output-contract");
  });

  it("detects output contract failures", async () => {
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: [],
      planTargets: [],
      outputContract: [{ kind: "contains-text", value: "UserService" }],
    };
    const result = await checkClaims(
      input,
      tmpDir,
      fakeDeps({ answer: "The AuthService handles login." }),
    );
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.passed).toBe(false);
  });

  it("checks contains-function contract", async () => {
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: [],
      planTargets: [],
      outputContract: [{ kind: "contains-function", value: "login" }],
    };
    const result = await checkClaims(
      input,
      tmpDir,
      fakeDeps({
        answer: "export async function login() { return true; }",
      }),
    );
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.passed).toBe(true);
  });

  it("returns allPassed false when any check fails", async () => {
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: ["nonexistent.ts"],
      citedSymbols: ["AuthService"],
      planTargets: [],
    };
    const result = await checkClaims(input, tmpDir, fakeDeps());
    expect(result.allPassed).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.passed).toBe(1);
  });
});
