import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskDefinition } from "@atlas/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { citedPathCandidates, evaluateTask, hallucinatedPaths, wrongFiles } from "../src/evaluator";

// ---------------------------------------------------------------------------
// Fixture repo on disk (for existence checks)
// ---------------------------------------------------------------------------

let repoDir: string;

beforeAll(() => {
  repoDir = join(tmpdir(), `atlas-eval-v2-${Date.now()}`);
  mkdirSync(join(repoDir, "src"), { recursive: true });
  writeFileSync(join(repoDir, "src", "auth.ts"), "export const auth = 1;\n");
  writeFileSync(join(repoDir, "src", "db.ts"), "export const db = 1;\n");
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

const baseTask: TaskDefinition = {
  id: "T-V2",
  category: "bug-investigation",
  prompt: "Investigate",
  expected_files: ["src/auth.ts"],
  expected_concepts: ["validation"],
  evaluation_method: "automated",
};

// ---------------------------------------------------------------------------
// citedPathCandidates / hallucinatedPaths
// ---------------------------------------------------------------------------

describe("citedPathCandidates", () => {
  it("extracts path-like strings without touching the filesystem", () => {
    const candidates = citedPathCandidates("Look at src/auth.ts and also src/does-not-exist.ts.");
    expect(candidates).toContain("src/auth.ts");
    expect(candidates).toContain("src/does-not-exist.ts");
  });

  it("returns empty when no paths are cited", () => {
    expect(citedPathCandidates("no paths here")).toEqual([]);
  });
});

describe("hallucinatedPaths", () => {
  it("flags cited paths that do not exist on disk", () => {
    const missing = hallucinatedPaths(
      "The fix belongs in src/auth.ts and src/hallucinated-file.ts.",
      repoDir,
    );
    expect(missing).toEqual(["src/hallucinated-file.ts"]);
  });

  it("returns empty when every cited path exists", () => {
    const missing = hallucinatedPaths("See src/auth.ts and src/db.ts.", repoDir);
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// wrongFiles
// ---------------------------------------------------------------------------

describe("wrongFiles", () => {
  it("returns undefined when no gold impact set is declared", () => {
    expect(wrongFiles(["src/auth.ts"], undefined)).toBeUndefined();
  });

  it("flags cited existing paths outside the gold impact set", () => {
    const wrong = wrongFiles(["src/auth.ts", "src/db.ts"], ["src/auth.ts"]);
    expect(wrong).toEqual(["src/db.ts"]);
  });

  it("returns empty when only gold files are cited", () => {
    expect(wrongFiles(["src/auth.ts"], ["src/auth.ts"])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// evaluateTask — v2 additive fields
// ---------------------------------------------------------------------------

describe("evaluateTask v2 fields", () => {
  it("reports hallucinated files for a seeded hallucinating answer", () => {
    const result = evaluateTask(
      baseTask,
      "The validation logic is in src/auth.ts; also check src/invented-utility.ts for validation handling.",
      [],
      repoDir,
    );
    expect(result.hallucinatedFiles).toContain("src/invented-utility.ts");
    expect(result.hallucinatedFiles).not.toContain("src/auth.ts");
  });

  it("reports wrong files against the gold impact set", () => {
    const result = evaluateTask(
      { ...baseTask, gold_impact_files: ["src/auth.ts"] },
      "Changes are needed in src/auth.ts and src/db.ts for validation.",
      [],
      repoDir,
    );
    expect(result.goldImpactFiles).toEqual(["src/auth.ts"]);
    expect(result.wrongFiles).toEqual(["src/db.ts"]);
  });

  it("omits wrongFiles/goldImpactFiles when the task declares no gold set", () => {
    const result = evaluateTask(baseTask, "See src/auth.ts for validation.", [], repoDir);
    expect(result.wrongFiles).toBeUndefined();
    expect(result.goldImpactFiles).toBeUndefined();
  });

  it("does not regress the original scoring", () => {
    const result = evaluateTask(baseTask, "Validation lives in src/auth.ts.", [], repoDir);
    // file hit found, concept hit found -> correct
    expect(result.score).toBe(2);
    expect(result.status).toBe("correct");
    expect(result.citedFiles).toContain("src/auth.ts");
  });
});
