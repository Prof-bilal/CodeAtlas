import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { discoverSkills, loadSkill, validateSkill } from "../src/skills";

// Integration check: the checked-in fresh-benchmark skill set must load through
// the real loader. This keeps the benchmark skills honest with the MVP (no
// hand-written fixtures that drift from what Config D actually injects).
const SKILLS_DIR = fileURLToPath(
  new URL("../../../benchmarks/2026-09-fresh/skills", import.meta.url),
);

describe("benchmark skills — real fresh-benchmark skill set", () => {
  it("discovers the seed skills", () => {
    const found = discoverSkills(SKILLS_DIR);
    expect(found.map((s) => s.id)).toEqual(
      [
        "backend-api",
        "frontend-debugging",
        "refactoring",
        "repository-debugging",
        "testing",
      ].sort(),
    );
  });

  it("validates every seed skill", () => {
    const found = discoverSkills(SKILLS_DIR);
    expect(found.length).toBeGreaterThanOrEqual(5);
    for (const s of found) {
      const problems = validateSkill(SKILLS_DIR, s.id);
      expect(problems, `skill ${s.id} should be valid`).toEqual([]);
    }
  });

  it("loads every seed skill fully (body + references)", () => {
    const found = discoverSkills(SKILLS_DIR);
    for (const s of found) {
      const skill = loadSkill(SKILLS_DIR, s.id);
      expect(skill, `skill ${s.id} loads`).not.toBeNull();
      expect(skill?.id).toBe(s.id);
      expect(skill?.manifest.description).not.toBe("");
      expect(skill?.body.trim().length).toBeGreaterThan(0);
    }
  });
});
