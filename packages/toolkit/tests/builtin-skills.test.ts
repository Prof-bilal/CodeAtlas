import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_SKILL_IDS,
  listBuiltinSkills,
  loadBuiltinSkill,
  prebuiltSkillDir,
  prebuiltSkillRoot,
  validateBuiltinSkill,
} from "../src/index";
import { discoverSkills, loadSkill, tryReadSkill } from "../src/skills/loader";

describe("built-in workflow Skills", () => {
  it("ships the curated prebuilt library (13 workflows)", () => {
    expect(BUILTIN_SKILL_IDS).toEqual([
      "mcp-builder",
      "deep-research",
      "trail-of-bits-security-skills",
      "webapp-testing",
      "ui-check",
      "ui-research",
      "ui-build",
      "systematic-debugging",
      "verification-before-completion",
      "writing-plans",
      "executing-plans",
      "using-git-worktrees",
      "react-best-practices",
    ]);
    expect(listBuiltinSkills()).toHaveLength(13);
  });

  it("stores every built-in as a canonical SKILL.md file on disk", () => {
    expect(existsSync(prebuiltSkillRoot())).toBe(true);
    for (const id of BUILTIN_SKILL_IDS) {
      const dir = prebuiltSkillDir(id);
      expect(existsSync(dir), dir).toBe(true);
      expect(existsSync(join(dir, "SKILL.md")), `${dir}/SKILL.md`).toBe(true);
    }
  });

  it("validates and loads every built-in through the existing loader", () => {
    for (const id of BUILTIN_SKILL_IDS) {
      expect(validateBuiltinSkill(id), id).toEqual([]);
      // Direct loader parity: the same file must load with the canonical
      // custom-skills loader, proving one format for built-ins and custom.
      expect(tryReadSkill(prebuiltSkillDir(id), id)?.id, id).toBe(id);
      const skill = loadBuiltinSkill(id);
      expect(skill?.id).toBe(id);
      expect(skill?.manifest.name).toBe(id);
      expect(skill?.manifest.description.length).toBeGreaterThan(20);
      expect(skill?.manifest.version).toBe("1.0.0");
      expect(skill?.body.length).toBeGreaterThan(100);
      expect(skill?.path).toBe(`builtin://${id}`);
    }
  });

  it("discovers built-ins through the same discovery used for custom skills", () => {
    const discovered = discoverSkills(prebuiltSkillRoot());
    const ids = discovered.map((entry) => entry.id).sort();
    expect(ids).toEqual([...BUILTIN_SKILL_IDS].sort());
  });

  it("loads built-ins through the generic loadSkill path as well", () => {
    for (const id of BUILTIN_SKILL_IDS) {
      expect(loadSkill(prebuiltSkillRoot(), id)?.id, id).toBe(id);
    }
  });

  it("does not resolve unknown built-ins", () => {
    expect(loadBuiltinSkill("not-a-skill")).toBeNull();
    expect(validateBuiltinSkill("not-a-skill")).toEqual([
      "built-in skill not found or invalid: not-a-skill",
    ]);
  });

  it("frontmatter name matches the directory id for every built-in", () => {
    for (const id of BUILTIN_SKILL_IDS) {
      expect(loadBuiltinSkill(id)?.manifest.name, id).toBe(id);
    }
  });

  describe("ui-research workflow contract", () => {
    it("encodes the autonomous reference flow", () => {
      const skill = loadBuiltinSkill("ui-research");
      expect(skill).not.toBeNull();
      const body = skill?.body ?? "";
      expect(skill?.manifest.allowedTools).toContain("atlas browse interact");
      expect(body).toContain("design.md");
      expect(body).toContain("atlas browse snapshot");
      expect(body).toContain("atlas browse responsive");
      expect(body).toContain("atlas browse interact");
      expect(body).toContain("allowlisted");
      expect(body).toContain("closely follow the design");
      expect(body).toContain("adapt it to the project");
      expect(body).toContain("inspiration only");
      expect(body).toContain("Observed");
      expect(body).toContain("Inferred");
      expect(body).toContain("Recommended");
      expect(body).toContain("design-intent question");
      expect(body).toContain(".codeatlas/evidence/");
    });

    it("encodes the fresh-UI flow without a reference URL", () => {
      const body = loadBuiltinSkill("ui-research")?.body ?? "";
      expect(body).toContain("Fresh-UI flow");
      expect(body).toContain("atlas search");
      expect(body).toContain("atlas inspect");
      expect(body).toContain("design direction");
    });
  });

  describe("ui-build workflow contract", () => {
    it("consumes design.md and verifies through browser observation", () => {
      const body = loadBuiltinSkill("ui-build")?.body ?? "";
      expect(body).toContain("design.md");
      expect(body).toContain("ui-research");
      expect(body).toContain("390x844");
      expect(body).toContain("768x1024");
      expect(body).toContain("1280x800");
      expect(body).toContain("Never invent accessibility or quality scores");
      expect(body).toContain("could not run");
    });
  });
});
