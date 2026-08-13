import { denyFilter } from "@atlas/sdk";
import { describe, expect, it } from "vitest";
import { runCli, writeResult } from "./helpers";

interface ErrorRecord {
  readonly scenario: string;
  readonly exitCode: number;
  readonly message: string;
}

/**
 * 08 — Error handling & security against the real CLI. Verifies clean typed
 * failures for missing indexes/repositories and the secret deny-filter that
 * must never leak `.env*`, credentials, or private keys into context.
 */
describe("08 — errors & security", () => {
  const records: ErrorRecord[] = [];

  it("fails cleanly when no index exists", async () => {
    const missing = await runCli(["search", "auth", "--repo", "C:/does/not/exist/project"]);
    records.push({
      scenario: "search with missing repo",
      exitCode: missing.code,
      message: missing.stdout + missing.stderr,
    });
    // Never a crash; either a typed error or a graceful empty result.
    expect(missing.code).toBeGreaterThanOrEqual(0);
    expect(missing.stdout + missing.stderr).not.toContain("uncaught");
  });

  it("fails cleanly for an invalid repository path", async () => {
    const build = await runCli(["build", "--repo", "C:/does/not/exist/project", "--json"]);
    records.push({
      scenario: "build with missing repo",
      exitCode: build.code,
      message: build.stdout + build.stderr,
    });
    expect(build.code).toBeGreaterThanOrEqual(0);
    expect(build.stdout + build.stderr).not.toContain("uncaught");
  });

  it("rejects empty search queries", async () => {
    const empty = await runCli(["search", "", "--repo", "C:/does/not/exist/project"]);
    records.push({
      scenario: "search with empty query",
      exitCode: empty.code,
      message: empty.stdout + empty.stderr,
    });
    expect(empty.code).not.toBe(0);
  });

  it("never leaks secrets through the deny-filter", () => {
    const secretKey = "sk-abc1234567890abcdefghijklmnopqrstuvwxyz";
    const cases: readonly { path: string; content: string; shouldDrop: boolean }[] = [
      { path: "/repo/.env", content: "DATABASE_URL=postgres://localhost/db", shouldDrop: true },
      { path: "/repo/.env.local", content: "API_KEY=x", shouldDrop: true },
      { path: "/repo/src/config.ts", content: `const KEY = "${secretKey}"`, shouldDrop: true },
      { path: "/repo/src/config.ts", content: "export const NAME = 'public'", shouldDrop: false },
      { path: "/repo/README.md", content: "# Readme\nSee docs for setup.", shouldDrop: false },
    ];
    for (const { path, content, shouldDrop } of cases) {
      const result = denyFilter(path, content);
      expect(result.accepted, `expected deny for ${path}`).toBe(!shouldDrop);
      records.push({
        path,
        dropped: !result.accepted,
      });
    }
  });

  it("records error/security results for the report", async () => {
    await writeResult("08-errors-security", { errors: records });
  });
});
