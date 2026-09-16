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

  it("never instructs agents to run the removed browser-control layer", () => {
    for (const id of BUILTIN_SKILL_IDS) {
      const skill = loadBuiltinSkill(id);
      const body = skill?.body ?? "";
      const allowed = skill?.manifest.allowedTools ?? [];
      expect(
        allowed.some((tool) => tool.includes("atlas browse")),
        id,
      ).toBe(false);
      // No Skill advertises the removed layer or routes rendering checks to a
      // browser runner; the word itself must not survive in any Skill body.
      expect(body, id).not.toContain("atlas browse");
      expect(body, id).not.toMatch(/playwright/i);
      expect(body, id).not.toMatch(/browser/i);
    }
  });

  it("routes web-dependent Skills through the agent's own web access", () => {
    for (const id of ["ui-research", "ui-check", "webapp-testing"] as const) {
      const skill = loadBuiltinSkill(id);
      const body = skill?.body ?? "";
      expect(body, id).toContain("web fetch");
      expect(body, id).toContain("no rendering tooling");
    }
  });

  describe("ui-research workflow contract", () => {
    it("encodes the autonomous reference flow", () => {
      const skill = loadBuiltinSkill("ui-research");
      expect(skill).not.toBeNull();
      const body = skill?.body ?? "";
      expect(skill?.manifest.allowedTools).toContain("atlas search");
      expect(skill?.manifest.allowedTools).toContain("atlas inspect");
      expect(body).toContain("design.md");
      expect(body).toContain("closely follow the design");
      expect(body).toContain("adapt it to the project");
      expect(body).toContain("inspiration only");
      expect(body).toContain("Observed");
      expect(body).toContain("Inferred");
      expect(body).toContain("Recommended");
      expect(body).toContain("design-intent question");
      expect(body).toContain("second artifact");
      expect(body).toContain("Never claim a rendered");
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
    it("consumes design.md and verifies with the project's own tooling", () => {
      const body = loadBuiltinSkill("ui-build")?.body ?? "";
      expect(body).toContain("design.md");
      expect(body).toContain("ui-research");
      expect(body).toContain("Never invent accessibility or quality scores");
      expect(body).toContain("could not run");
      // Verification runs on tooling the repository already has; rendered
      // checks are recorded as could-not-run, never routed to a runner.
      expect(body).toContain("tooling the repository already has");
      expect(body).toContain("Do not add dependencies to the project");
      expect(body).toContain("not observable with the tooling this release ships");
    });
  });

  describe("ui-check workflow contract", () => {
    it("separates checkable source evidence from unchecked rendering", () => {
      const body = loadBuiltinSkill("ui-check")?.body ?? "";
      expect(body).toContain("What can and cannot be checked");
      expect(body).toContain("@media");
      expect(body).toContain("could not run");
      expect(body).toContain("No invented accessibility or quality scores");
    });
  });

  describe("webapp-testing workflow contract", () => {
    it("uses the project's own observable checks as evidence", () => {
      const body = loadBuiltinSkill("webapp-testing")?.body ?? "";
      expect(body).toContain("What counts as observable here");
      expect(body).toContain("project's own test suite");
      expect(body).toContain("could not run");
      expect(body).toMatch(/never infer a rendered result from code/i);
      expect(body).toContain("not observable in this release");
      expect(body).toContain("Do not add test dependencies to the project");
    });
  });
});
