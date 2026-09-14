import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addCustomSkill,
  createCustomSkill,
  resolveSkillInstructions,
  resolveSkillsInstructions,
} from "../src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe("custom Skill authoring", () => {
  it("creates a validated Skill template and refuses accidental replacement", async () => {
    const root = mkdtempSync(join("/tmp", "atlas-custom-skill-"));
    roots.push(root);

    const created = await createCustomSkill({
      root,
      id: "release-check",
      description: "Check a release before publishing.",
    });
    expect(created.ok).toBe(true);
    expect(
      readFileSync(join(root, ".codeatlas", "skills", "release-check", "SKILL.md"), "utf8"),
    ).toContain("name: release-check");

    const duplicate = await createCustomSkill({
      root,
      id: "release-check",
      description: "Another description.",
    });
    expect(duplicate.ok).toBe(false);
    expect(
      (
        await createCustomSkill({
          root,
          id: "release-check",
          description: "Updated description.",
          force: true,
        })
      ).ok,
    ).toBe(true);
  });

  it("copies a validated Skill and bounded references into the project", async () => {
    const root = mkdtempSync(join("/tmp", "atlas-custom-skill-"));
    roots.push(root);
    const source = join(root, "source-skill");
    mkdirSync(join(source, "references", "checks"), { recursive: true });
    writeFileSync(
      join(source, "SKILL.md"),
      "---\nname: source-skill\ndescription: A source workflow\n---\n\nDo the work safely.\n",
    );
    writeFileSync(join(source, "references", "checks", "release.md"), "- verify version\n");

    const added = await addCustomSkill({ root, sourceDir: source });
    expect(added.ok).toBe(true);
    expect(
      readFileSync(
        join(root, ".codeatlas", "skills", "source-skill", "references", "checks", "release.md"),
        "utf8",
      ),
    ).toContain("verify version");
  });

  it("rejects invalid ids and malformed source Skills", async () => {
    const root = mkdtempSync(join("/tmp", "atlas-custom-skill-"));
    roots.push(root);
    expect((await createCustomSkill({ root, id: "../escape", description: "unsafe" })).ok).toBe(
      false,
    );
    const source = join(root, "bad-skill");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "SKILL.md"), "not frontmatter");
    expect((await addCustomSkill({ root, sourceDir: source })).ok).toBe(false);
  });
});

describe("skill resolution for launch-time injection", () => {
  it("resolves a built-in skill by id through the existing SkillPort", () => {
    const root = mkdtempSync(join("/tmp", "atlas-skill-resolve-"));
    roots.push(root);
    const resolved = resolveSkillInstructions("ui-check", { root });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.ids).toEqual(["ui-check"]);
      expect(resolved.value.instructions).toContain("Reusable skill applied to this task");
      expect(resolved.value.instructions).toContain("UI Check");
    }
  });

  it("prefers a project custom skill over a same-id built-in", () => {
    const root = mkdtempSync(join("/tmp", "atlas-skill-resolve-"));
    roots.push(root);
    const dir = join(root, ".codeatlas", "skills", "deep-research");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: deep-research\ndescription: Custom variant for this project.\nversion: 1.0.0\n---\n\n# Custom Deep Research\n\nProject-specific steps.\n",
    );
    const resolved = resolveSkillInstructions("deep-research", { root });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.instructions).toContain("Custom Deep Research");
      expect(resolved.value.instructions).not.toContain("evidence-backed recommendation");
    }
  });

  it("lists available ids when a skill cannot be resolved", () => {
    const root = mkdtempSync(join("/tmp", "atlas-skill-resolve-"));
    roots.push(root);
    const resolved = resolveSkillInstructions("no-such-skill", { root });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.message).toContain("no-such-skill");
      expect(resolved.error.message).toContain("ui-check");
    }
  });

  it("combines multiple ids in order and deduplicates", () => {
    const root = mkdtempSync(join("/tmp", "atlas-skill-resolve-"));
    roots.push(root);
    const resolved = resolveSkillsInstructions(["ui-check", "writing-plans", "ui-check"], { root });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.ids).toEqual(["ui-check", "writing-plans"]);
      expect(resolved.value.instructions.indexOf("UI Check")).toBeLessThan(
        resolved.value.instructions.indexOf("Writing Plans"),
      );
    }
  });

  it("returns an empty block for an empty id list", () => {
    expect(resolveSkillsInstructions([], {}).ok ? "empty" : "error").toBe("empty");
  });
});
