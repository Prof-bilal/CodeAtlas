import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { ClaimCheckInput, VerifyConfig } from "@atlas/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createVerifierService } from "../src/verifier.service.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = resolve(tmpdir(), `verifier-service-${Date.now()}`);
  mkdirSync(resolve(tmpDir, ".codeatlas"), { recursive: true });
});

function fakeDeps(
  overrides: {
    symbols?: string[];
    answer?: string;
    fingerprint?: string;
  } = {},
) {
  return {
    resolveSymbols: async () => overrides.symbols ?? ["AuthService", "login"],
    getAnswerText: () => overrides.answer ?? "The AuthService handles login.",
    computeFingerprint: async () => overrides.fingerprint ?? "fp-abc",
    log: () => {},
  };
}

describe("createVerifierService", () => {
  it("runs claim checks only when no config provided", async () => {
    const service = createVerifierService(fakeDeps());
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: ["AuthService"],
      planTargets: [],
    };
    const report = await service.verify(input, undefined, tmpDir);
    expect(report.strategy).toBe("claim-checks");
    expect(report.claims.allPassed).toBe(true);
    expect(report.commands).toHaveLength(0);
    expect(report.verdict).toBe("pass");
  });

  it("runs claim checks + commands when config provided", async () => {
    writeFileSync(
      resolve(tmpDir, ".codeatlas", "verify.json"),
      JSON.stringify({
        enabled: true,
        commands: {
          typecheck: { command: "echo", args: ["ok"], timeoutMs: 5000 },
        },
      }),
    );

    const service = createVerifierService(fakeDeps());
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: ["AuthService"],
      planTargets: [],
    };
    const report = await service.verify(input, loadConfig(), tmpDir);
    expect(report.strategy).toBe("command-runners");
    expect(report.commands.length).toBeGreaterThan(0);
  });

  it("returns verdict fail when claims fail", async () => {
    const service = createVerifierService(fakeDeps());
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: ["NonExistent"],
      planTargets: [],
    };
    const report = await service.verify(input, undefined, tmpDir);
    expect(report.verdict).toBe("fail");
    expect(report.claims.allPassed).toBe(false);
  });

  it("returns verdict pass when all claims pass", async () => {
    const service = createVerifierService(fakeDeps());
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: ["AuthService"],
      planTargets: [],
    };
    const report = await service.verify(input, undefined, tmpDir);
    expect(report.verdict).toBe("pass");
    expect(report.claims.allPassed).toBe(true);
  });

  it("includes timestamp in report", async () => {
    const service = createVerifierService(fakeDeps());
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: [],
      planTargets: [],
    };
    const report = await service.verify(input, undefined, tmpDir);
    expect(report.timestamp).toBeDefined();
    expect(new Date(report.timestamp).getTime()).toBeGreaterThan(0);
  });

  it("returns verdict skipped when no claims and no commands", async () => {
    const service = createVerifierService(fakeDeps());
    const input: ClaimCheckInput = {
      task: "fix auth",
      citedPaths: [],
      citedSymbols: [],
      planTargets: [],
    };
    const report = await service.verify(input, { enabled: false, commands: {} }, tmpDir);
    expect(report.verdict).toBe("skipped");
  });
});

function loadConfig(): VerifyConfig {
  return JSON.parse(readFileSync(resolve(tmpDir, ".codeatlas", "verify.json"), "utf-8"));
}
