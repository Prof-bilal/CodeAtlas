import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCli } from "../src/cli";

/**
 * Regression coverage for the Skills discovery UX. The bug this guards against:
 * bare `atlas skills` printed only help, and `atlas skills list` scanned only
 * `.codeatlas/skills/`, so the shipped built-in library was invisible unless a
 * user knew to pass `--builtin`.
 */

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-skills-"));
  roots.push(root);
  return root;
}

function writeSkill(root: string, id: string): void {
  const dir = join(root, ".codeatlas", "skills", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${id}`,
      `description: A project-local workflow for ${id} that is long enough to pass validation.`,
      "version: 1.0.0",
      "allowed-tools: [atlas search]",
      "---",
      "",
      `# ${id}`,
      "",
      "## Goal",
      "",
      "Fixture body: describe the workflow, its evidence, and its verification steps.",
      "",
    ].join("\n"),
  );
}

async function capture(argv: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map(String).join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    err.push(args.map(String).join(" "));
  });
  try {
    await createCli().parseAsync(["node", "atlas", ...argv]);
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
  return { stdout: out.join("\n"), stderr: err.join("\n") };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

describe("atlas skills", () => {
  it("lists the built-in library for the bare command", async () => {
    const { stdout } = await capture(["skills"]);
    expect(stdout).toContain("Skills (");
    expect(stdout).toContain("built-in");
    expect(stdout).toContain("mcp-builder");
    expect(stdout).toContain("verification-before-completion");
  });

  it("ships the same 13 built-ins as the toolkit library", async () => {
    const { stdout } = await capture(["skills", "--builtin", "--json"]);
    const rows = JSON.parse(stdout) as readonly { id: string; source: string }[];
    expect(rows).toHaveLength(13);
    expect(rows.every((row) => row.source === "builtin")).toBe(true);
    expect(rows.map((row) => row.id)).toContain("ui-research");
  });

  it("is reachable through the singular `skill` alias", async () => {
    const { stdout } = await capture(["skill", "--builtin", "--json"]);
    expect(JSON.parse(stdout)).toHaveLength(13);
  });

  it("merges project Skills with built-ins and marks the source", async () => {
    const root = tempRoot();
    writeSkill(root, "release-check");
    const { stdout } = await capture(["skills", "--root", root, "--json"]);
    const rows = JSON.parse(stdout) as readonly { id: string; source: string }[];
    expect(rows).toHaveLength(14);
    expect(rows.find((row) => row.id === "release-check")?.source).toBe("installed");
    expect(rows.filter((row) => row.source === "builtin")).toHaveLength(13);
  });

  it("narrows to installed Skills with --installed", async () => {
    const root = tempRoot();
    writeSkill(root, "release-check");
    const { stdout } = await capture(["skills", "--installed", "--root", root, "--json"]);
    const rows = JSON.parse(stdout) as readonly { id: string }[];
    expect(rows.map((row) => row.id)).toEqual(["release-check"]);
  });

  it("inspects a built-in without requiring --builtin", async () => {
    const { stdout } = await capture(["skills", "info", "mcp-builder"]);
    expect(stdout).toContain("[builtin]");
    expect(stdout).toContain("builtin://mcp-builder");
    expect(stdout).toContain("--- Instructions ---");
  });

  it("inspects a Skill from the bare `atlas skills <name>` form", async () => {
    // Commander forwards an unknown first argument to the default `list`
    // subcommand; it must show the Skill rather than silently listing all.
    const { stdout } = await capture(["skills", "systematic-debugging"]);
    expect(stdout).toContain("[builtin]");
    expect(stdout).toContain("--- Instructions ---");
    expect(stdout).not.toContain("Skills (13");
  });

  it("reports an unknown id instead of listing everything", async () => {
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const { stdout, stderr } = await capture(["skills", "not-a-skill"]);
    expect(stderr).toContain("Skill not found: not-a-skill");
    expect(stdout).not.toContain("Skills (");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("prefers a project Skill that overrides a built-in id", async () => {
    const root = tempRoot();
    writeSkill(root, "mcp-builder");
    const { stdout } = await capture(["skills", "info", "mcp-builder", "--root", root]);
    expect(stdout).toContain("[installed]");
    expect(stdout).toContain(join(root, ".codeatlas", "skills", "mcp-builder"));
  });

  it("validates a built-in and reports an unknown id", async () => {
    const valid = await capture(["skills", "validate", "mcp-builder"]);
    expect(valid.stdout).toContain("is valid");

    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const missing = await capture(["skills", "validate", "not-a-skill"]);
    expect(missing.stderr).toContain("not found");
    expect(exit).toHaveBeenCalledWith(1);
  });
});
