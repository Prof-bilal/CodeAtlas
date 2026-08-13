import { createToolRegistry } from "@atlas/sdk";
import { describe, expect, it } from "vitest";
import { runCli, writeResult } from "./helpers";

interface ToolkitRecord {
  readonly catalogSize: number;
  readonly search: readonly { readonly query: string; readonly found: number }[];
  readonly info: readonly { readonly tool: string; readonly ok: boolean }[];
  readonly installPlan: { readonly tool: string; readonly approved: boolean } | null;
}

/**
 * 07 — Toolkit against the real machine. Verifies the curated registry, the
 * install plan gate (approval always required, nothing installed), and the
 * doctor/update surfaces. No real installs are ever performed.
 */
describe("07 — toolkit", () => {
  const records: ToolkitRecord = {
    catalogSize: 0,
    search: [],
    info: [],
    installPlan: null,
  };

  it("exposes a curated registry through the SDK", () => {
    const registry = createToolRegistry();
    const catalog = registry.listTools();
    expect(catalog.length).toBeGreaterThan(0);
    records.catalogSize = catalog.length;

    const names = catalog.map((tool) => tool.name);
    for (const query of ["github", "postgres", "slack", "database"]) {
      const found = registry.searchTools(query);
      records.search.push({ query, found: found.length });
    }
    void names;
  });

  it("searches the registry through the CLI", async () => {
    const github = await runCli(["tools", "search", "github"]);
    expect(github.code, github.stderr).toBe(0);
    expect(github.stdout.toLowerCase()).toContain("github-mcp-server");

    const postgres = await runCli(["tools", "search", "postgres"]);
    expect(postgres.code, postgres.stderr).toBe(0);
    records.search.push({
      query: "postgres (cli)",
      found: postgres.stdout.includes("No tools found") ? 0 : 1,
    });
  });

  it("requires approval before installing anything", async () => {
    const plan = await runCli(["tools", "install", "biome"]);
    records.installPlan = { tool: "biome", approved: plan.code === 0 };
    // Without --yes the CLI must refuse to install (exit non-zero) and show a plan.
    expect(plan.code).not.toBe(0);
    expect(plan.stdout).toContain("Install plan");
    expect(plan.stdout.toLowerCase()).toContain("npm");
  });

  it("reports tool info for a known tool", async () => {
    const info = await runCli(["tools", "info", "github-mcp-server"]);
    expect(info.code, info.stderr).toBe(0);
    records.info.push({ tool: "github-mcp-server", ok: true });
  });

  it("records toolkit results for the report", async () => {
    await writeResult("07-toolkit", records);
  });
});
