import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hiddenTestsPassed, runHiddenTests } from "../src/test-runner";

// The repo root of this monorepo (has node_modules and a package.json).
const MONOREPO_ROOT = join(__dirname, "../../..");

// ---------------------------------------------------------------------------
// Refusals (safe defaults)
// ---------------------------------------------------------------------------

describe("runHiddenTests refusals", () => {
  it("refuses to execute without explicit allowExecution", async () => {
    const result = await runHiddenTests({
      repoPath: MONOREPO_ROOT,
      testFiles: ["packages/benchmark/tests/test-runner.test.ts"],
      command: ["node", "-e", "process.exit(0)"],
    });
    expect(result.executed).toBe(false);
    expect(result.reason).toContain("allowExecution");
  });

  it("refuses when a hidden test file is missing", async () => {
    const result = await runHiddenTests({
      repoPath: MONOREPO_ROOT,
      testFiles: ["does/not/exist.test.ts"],
      allowExecution: true,
    });
    expect(result.executed).toBe(false);
    expect(result.filesPresent).toBe(false);
    expect(result.missingFiles).toContain("does/not/exist.test.ts");
  });

  it("refuses an empty command", async () => {
    const result = await runHiddenTests({
      repoPath: MONOREPO_ROOT,
      testFiles: ["packages/benchmark/tests/test-runner.test.ts"],
      allowExecution: true,
      command: [],
    });
    expect(result.executed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Execution (argv-array spawn, shell: false)
// ---------------------------------------------------------------------------

describe("runHiddenTests execution", () => {
  it("runs a passing command and reports success", async () => {
    const result = await runHiddenTests({
      repoPath: MONOREPO_ROOT,
      testFiles: ["packages/benchmark/tests/test-runner.test.ts"],
      allowExecution: true,
      command: ["node", "-e", "console.log('ok'); process.exit(0)"],
    });
    expect(result.executed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(hiddenTestsPassed(result)).toBe(true);
    expect(result.output).toContain("ok");
  });

  it("reports failing exit codes without throwing", async () => {
    const result = await runHiddenTests({
      repoPath: MONOREPO_ROOT,
      testFiles: ["packages/benchmark/tests/test-runner.test.ts"],
      allowExecution: true,
      command: ["node", "-e", "console.error('boom'); process.exit(1)"],
    });
    expect(result.executed).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(hiddenTestsPassed(result)).toBe(false);
    expect(result.output).toContain("boom");
  });

  it("kills commands that exceed the timeout", async () => {
    const result = await runHiddenTests({
      repoPath: MONOREPO_ROOT,
      testFiles: ["packages/benchmark/tests/test-runner.test.ts"],
      allowExecution: true,
      timeoutMs: 500,
      command: ["node", "-e", "setTimeout(() => {}, 30000)"],
    });
    expect(result.timedOut).toBe(true);
    expect(result.executed).toBe(false);
    expect(hiddenTestsPassed(result)).toBe(false);
  }, 10_000);
});
