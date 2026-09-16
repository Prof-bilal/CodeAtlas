import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCli } from "../src/cli";
import { parseSelection, renderSetupPlan } from "../src/commands/setup";

const roots: string[] = [];

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-setup-"));
  roots.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { react: "19.0.0", vite: "6.0.0" } }),
  );
  return root;
}

async function capture(
  argv: readonly string[],
  prompt?: (question: string) => Promise<string>,
): Promise<{ stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map(String).join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    err.push(args.map(String).join(" "));
  });
  try {
    await createCli(prompt === undefined ? {} : { prompt }).parseAsync(["node", "atlas", ...argv]);
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
  return { stdout: out.join("\n"), stderr: err.join("\n") };
}

afterEach(() => {
  vi.restoreAllMocks();
  roots.length = 0;
});

describe("parseSelection", () => {
  const candidates = ["a", "b", "c", "d"].map((id) => ({ id })) as unknown as Parameters<
    typeof parseSelection
  >[1];

  it("accepts numbers, ranges, all, and none", () => {
    expect(parseSelection("1,3", candidates)).toEqual(["a", "c"]);
    expect(parseSelection("2-4", candidates)).toEqual(["b", "c", "d"]);
    expect(parseSelection("4-2", candidates)).toEqual(["b", "c", "d"]);
    expect(parseSelection("all", candidates)).toEqual(["a", "b", "c", "d"]);
    expect(parseSelection("none", candidates)).toEqual([]);
    expect(parseSelection("", candidates)).toEqual([]);
  });

  it("ignores out-of-range and non-numeric entries instead of failing", () => {
    expect(parseSelection("1,99,banana", candidates)).toEqual(["a"]);
  });

  it("de-duplicates repeated selections", () => {
    expect(parseSelection("1,1,1-2", candidates)).toEqual(["a", "b"]);
  });
});

describe("renderSetupPlan", () => {
  it("lists numbered candidates and the built-in library separately", async () => {
    const root = projectRoot();
    const { stdout } = await capture(["setup", "--repo", root]);
    expect(stdout).toContain(`Project: ${root}`);
    expect(stdout).toContain("Recommended Skills — already available, no install needed");
    expect(stdout).toContain("Recommended Tools & Skills — installable");
    expect(stdout).toContain("Optional — installable from the catalog");
    expect(stdout).toContain("built-in Skills ship with CodeAtlas");
    // The frontend evidence recommends two built-in Skills, shown unnumbered.
    expect(stdout).toContain("✓ webapp-testing");
    expect(stdout).toMatch(/^\s+1\) /m);
  });

  it("renders a supplied plan without touching installs", () => {
    const rendered = renderSetupPlan({
      root: "/tmp/example",
      profile: {
        frontend: true,
        backend: false,
        mcpSensitive: false,
        evidence: ["frontend markers"],
      },
      recommendations: [{ id: "ripgrep", kind: "tool", reason: "Curated recommendation." }],
      candidates: [
        {
          id: "ripgrep",
          kind: "tool",
          description: "fast search",
          trust: "community",
          recommended: true,
          reason: "Curated recommendation.",
          installed: false,
        },
        {
          id: "example-skill",
          kind: "skill",
          description: "example",
          trust: "community",
          recommended: false,
          reason: null,
          installed: true,
        },
      ],
      available: [{ id: "deep-research", description: "research", recommended: true }],
    });
    expect(rendered).toContain("recommended: Curated recommendation.");
    expect(rendered).toContain("2) example-skill [skill] (installed, trust:community)");
    expect(rendered).toContain("deep-research");
  });
});

describe("atlas setup", () => {
  it("installs nothing when no selection is made (non-interactive)", async () => {
    const root = projectRoot();
    const { stdout } = await capture(["setup", "--repo", root]);
    expect(stdout).toContain("Nothing selected — no Tools or Skills were installed.");
    expect(stdout).not.toContain("Install results:");
  });

  it("installs nothing when the interactive selection is empty", async () => {
    const root = projectRoot();
    const { stdout } = await capture(["setup", "--repo", root], async () => "none");
    expect(stdout).toContain("Nothing selected — no Tools or Skills were installed.");
  });

  it("aborts when the user declines the confirmation after selecting", async () => {
    const answers = ["1", "n"];
    const asked: string[] = [];
    const { stdout } = await capture(["setup", "--repo", projectRoot()], async (question) => {
      asked.push(question);
      return answers.shift() ?? "";
    });
    expect(asked[0]).toContain("Select items to install");
    expect(asked[1]).toContain("Install 1 selected item(s)?");
    expect(stdout).toContain("Aborted — nothing was installed.");
    expect(stdout).not.toContain("Install results:");
  });

  it("only plans the explicitly selected ids in dry-run mode", async () => {
    const root = projectRoot();
    const { stdout } = await capture([
      "setup",
      "--repo",
      root,
      "--tools",
      "ripgrep",
      "--dry-run",
      "--json",
    ]);
    const report = JSON.parse(stdout) as {
      selected: readonly string[];
      installs: readonly { id: string; status: string }[];
    };
    expect(report.selected).toEqual(["ripgrep"]);
    expect(report.installs).toEqual([
      { id: "ripgrep", status: "planned", note: "Would install after explicit approval." },
    ]);
  });

  it("requires --yes before executing a selected install", async () => {
    const root = projectRoot();
    const { stdout } = await capture(["setup", "--repo", root, "--tools", "ripgrep", "--json"]);
    const report = JSON.parse(stdout) as { installs: readonly { status: string }[] };
    expect(report.installs[0]?.status).toBe("approval-required");
  });
});
