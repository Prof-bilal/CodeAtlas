import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverSkills,
  isValidSkillId,
  loadSkill,
  renderSkillInstructions,
  resolveSkillForTask,
  splitFrontmatter,
  validateSkill,
} from "../src/skills";

describe("benchmark skills (minimal Agent Skills)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "skills-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeSkill(dir: string, md: string): void {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "SKILL.md"), md, "utf-8");
  }

  function sampleSkill(): string {
    return [
      "---",
      "name: frontend-debugging",
      "description: Debug React and Next.js frontend issues, hydration, state bugs",
      "version: 1.0.0",
      "allowed-tools: [web_search, web_fetch]",
      "---",
      "",
      "1. Reproduce the failing behavior.",
      "2. Trace state changes across components before editing.",
      "3. Verify with the frontend test suite.",
      "",
    ].join("\n");
  }

  it("parses frontmatter and body", () => {
    const raw = "---\nname: x\ndescription: y\nversion: 2.0.0\n---\nbody here";
    const parsed = splitFrontmatter(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.manifest["name"]).toBe("x");
    expect(parsed?.manifest["version"]).toBe("2.0.0");
    expect(parsed?.body).toBe("body here");
  });

  it("parses list values and booleans", () => {
    const parsed = splitFrontmatter(
      "---\nallowed-tools: [a, b]\ndisable-model-invocation: true\n---\n",
    );
    expect(parsed?.manifest["allowed-tools"]).toEqual(["a", "b"]);
    expect(parsed?.manifest["disable-model-invocation"]).toBe(true);
  });

  it("returns null for missing frontmatter", () => {
    expect(splitFrontmatter("just text")).toBeNull();
  });

  it("validates path-safe skill ids", () => {
    expect(isValidSkillId("frontend-debugging")).toBe(true);
    expect(isValidSkillId("a-1_b")).toBe(true);
    expect(isValidSkillId("..")).toBe(false);
    expect(isValidSkillId("../escape")).toBe(false);
    expect(isValidSkillId("has space")).toBe(false);
  });

  it("discovers skills as lightweight records", () => {
    writeSkill("frontend-debugging", sampleSkill());
    writeSkill("ignored-no-skill", "# not a skill\n");
    const found = discoverSkills(root);
    expect(found.map((s) => s.id)).toEqual(["frontend-debugging"]);
    expect(found[0]?.description).toContain("React");
    expect(found[0]?.version).toBe("1.0.0");
  });

  it("loads a full skill with body and references", () => {
    writeSkill("frontend-debugging", sampleSkill());
    mkdirSync(join(root, "frontend-debugging", "references"), { recursive: true });
    writeFileSync(
      join(root, "frontend-debugging", "references", "checklist.md"),
      "- [ ] repro\n- [ ] verify",
      "utf-8",
    );

    const skill = loadSkill(root, "frontend-debugging");
    expect(skill).not.toBeNull();
    expect(skill?.id).toBe("frontend-debugging");
    expect(skill?.body).toContain("Reproduce");
    expect(skill?.manifest.allowedTools).toEqual(["web_search", "web_fetch"]);
    expect(skill?.references.map((r) => r.relPath)).toEqual(["checklist.md"]);
  });

  it("rejects a mismatched frontmatter name", () => {
    writeSkill("other-name", "---\nname: different\ndescription: d\n---\nbody");
    expect(loadSkill(root, "other-name")).toBeNull();
  });

  it("rejects traversal via non-path-safe ids", () => {
    expect(loadSkill(root, "../etc")).toBeNull();
  });

  it("renders instructions that include body and references", () => {
    writeSkill("frontend-debugging", sampleSkill());
    const skill = loadSkill(root, "frontend-debugging");
    const rendered = renderSkillInstructions(skill);
    expect(rendered).toContain("Reusable skill applied");
    expect(rendered).toContain("Trace state changes");
  });

  it("renders empty instructions for null", () => {
    expect(renderSkillInstructions(null)).toBe("");
  });

  it("resolves a skill by explicit name", () => {
    writeSkill(
      "backend-api",
      "---\nname: backend-api\ndescription: Build and fix backend APIs\n---\nbody",
    );
    const skills = discoverSkills(root);
    const resolved = resolveSkillForTask(skills, { skill: "backend-api", prompt: "anything" });
    expect(resolved.reason).toBe("name-match");
    expect(resolved.skill?.id).toBe("backend-api");
  });

  it("resolves a skill by description match and none when no match", () => {
    writeSkill("testing", "---\nname: testing\ndescription: Write and fix unit tests\n---\nbody");
    const skills = discoverSkills(root);
    const matched = resolveSkillForTask(skills, { prompt: "Fix the failing unit tests" });
    expect(matched.reason).toBe("description-match");
    expect(matched.skill?.id).toBe("testing");

    const none = resolveSkillForTask(skills, { prompt: "paint the shed" });
    expect(none.reason).toBe("none");
    expect(none.renderedInstructions).toBe("");
  });

  it("validates a skill and reports problems", () => {
    writeSkill("good", "---\nname: good\ndescription: ok\n---\nbody");
    expect(validateSkill(root, "good")).toEqual([]);
    expect(validateSkill(root, "missing")).toEqual(["missing SKILL.md in missing"]);
    writeSkill("bad", "# no frontmatter");
    expect(validateSkill(root, "bad").join(" ")).toContain("no frontmatter");
  });
});
