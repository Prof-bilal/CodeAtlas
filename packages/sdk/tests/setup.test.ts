import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { InstallApproval } from "@prof-bilal/atlas-core";
import { fail, ok } from "@prof-bilal/atlas-shared";
import type { ToolManifest } from "@prof-bilal/atlas-toolkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { planSetup, runSetup } from "../src/setup";
import type { ToolkitSDK } from "../src/toolkit/facade";
import { createToolRegistry } from "../src/toolkit/registry";

const tempDirs: string[] = [];

afterEach(() => {
  // Vitest's temp directories are intentionally left to the OS; no project files
  // are removed by this test suite.
  tempDirs.length = 0;
});

function frontendRoot(): string {
  const root = mkdtempSync(join("/tmp", "atlas-setup-"));
  tempDirs.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { react: "19.0.0", vite: "6.0.0" } }),
  );
  return root;
}

/** A toolkit whose install/info/configure paths are never expected to run. */
function fakeToolkit(overrides: Partial<ToolkitSDK> = {}): ToolkitSDK {
  return {
    registry: createToolRegistry(),
    overview: async () => ok({ recommended: [], installed: [] }),
    search: () => [],
    listByCategory: () => [],
    info: async () => fail(new Error("fixture: info not stubbed")),
    planInstall: async () => fail(new Error("fixture: planInstall not stubbed")),
    install: async () => fail(new Error("fixture: install not stubbed")),
    remove: async () => fail(new Error("fixture: remove not stubbed")),
    update: async () => ok({ registryTools: 0, installedTools: 0, updated: [], note: "fixture" }),
    doctor: async () => ok([]),
    configure: async () => fail(new Error("fixture: configure not stubbed")),
    createCustomToolTemplate: () => fail(new Error("fixture: not stubbed")),
    validateCustomTool: () => fail(new Error("fixture: not stubbed")),
    addCustomTool: async () => fail(new Error("fixture: not stubbed")),
    ...overrides,
  } as unknown as ToolkitSDK;
}

describe("planSetup", () => {
  it("recommends evidence-based Skills and lists shipped Skills as already available", async () => {
    const root = frontendRoot();
    const result = await planSetup({ root, toolkit: fakeToolkit() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.profile.frontend).toBe(true);
    expect(result.value.recommendations.map((item) => item.id)).toEqual([
      "webapp-testing",
      "react-best-practices",
    ]);
    // Both are first-party Skills, so they are never install candidates…
    expect(result.value.candidates.some((item) => item.id === "webapp-testing")).toBe(false);
    expect(result.value.candidates.some((item) => item.id === "react-best-practices")).toBe(false);
    // …and are reported as already available instead.
    expect(result.value.available.map((skill) => skill.id)).toContain("webapp-testing");
    expect(result.value.available).toHaveLength(13);
  });

  it("puts curated installable recommendations ahead of optional entries", async () => {
    const root = frontendRoot();
    const registry = createToolRegistry();
    const curated = registry.getTool("ripgrep");
    expect(curated).toBeDefined();
    const toolkit = fakeToolkit({
      overview: async () =>
        ok({
          recommended: curated === undefined ? [] : [curated],
          installed: [],
        }),
    });

    const result = await planSetup({ root, toolkit });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.candidates[0]?.id).toBe("ripgrep");
    expect(result.value.candidates[0]?.recommended).toBe(true);
    expect(result.value.candidates[0]?.reason).toContain("recommended");
    // Everything after the recommended block is optional: Skills first, then
    // tools, each alphabetically by id.
    const optional = result.value.candidates.filter((item) => !item.recommended);
    expect(optional.length).toBeGreaterThan(0);
    for (const kind of ["skill", "tool"] as const) {
      const ids = optional.filter((item) => item.kind === kind).map((item) => item.id);
      expect(ids, kind).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    }
  });

  it("marks candidates that already have an installed manifest", async () => {
    const root = frontendRoot();
    const registry = createToolRegistry();
    const installed = {
      name: "ripgrep",
      toolVersion: "14.0.0",
    } as unknown as ToolManifest;
    const result = await planSetup({
      root,
      toolkit: fakeToolkit({
        overview: async () => {
          const rg = registry.getTool("ripgrep");
          return ok({ recommended: rg === undefined ? [] : [rg], installed: [installed] });
        },
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates.find((item) => item.id === "ripgrep")?.installed).toBe(true);
  });
});

describe("runSetup", () => {
  it("selects nothing implicitly and installs nothing without a selection", async () => {
    const root = frontendRoot();
    const install = vi.fn(async () =>
      fail(new Error("install must not run without an explicit selection")),
    );
    const result = await runSetup({ root, toolkit: fakeToolkit({ install }) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recommendations.length).toBeGreaterThan(0);
    expect(result.value.selected).toEqual([]);
    expect(result.value.installs).toEqual([]);
    expect(install).not.toHaveBeenCalled();
  });

  it("plans selected installs without executing them in dry-run mode", async () => {
    const root = frontendRoot();
    const install = vi.fn(async () => fail(new Error("dry run must not install")));
    const result = await runSetup({
      root,
      dryRun: true,
      selected: ["ripgrep"],
      toolkit: fakeToolkit({ install }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.installs).toEqual([
      { id: "ripgrep", status: "planned", note: "Would install after explicit approval." },
    ]);
    expect(result.value.validation.every((item) => item.status === "planned")).toBe(true);
    expect(result.value.atlas.banner).toBe("ATLAS SETUP INCOMPLETE");
    expect(install).not.toHaveBeenCalled();
  });

  it("requires explicit approval for selected installs", async () => {
    const root = mkdtempSync(join("/tmp", "atlas-setup-"));
    tempDirs.push(root);
    mkdirSync(join(root, ".codeatlas"), { recursive: true });

    const result = await runSetup({ root, selected: ["deep-research"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.installs).toEqual([
      {
        id: "deep-research",
        status: "approval-required",
        note: "Skipped: rerun with --yes to approve installation.",
      },
    ]);
    expect(result.value.atlasReady).toBe(false);
    expect(result.value.atlas.blockers[0]).toContain("rerun with --yes");
  });

  it("installs exactly the selected ids once approved", async () => {
    const root = mkdtempSync(join("/tmp", "atlas-setup-"));
    tempDirs.push(root);
    mkdirSync(join(root, ".codeatlas"), { recursive: true });
    const calls: string[] = [];
    const install = vi.fn(async (name: string, _approval: InstallApproval) => {
      calls.push(name);
      return ok({
        toolName: name,
        installed: true,
        verification: "verified",
        verificationNote: null,
        manifestPath: null,
        rollback: "not-needed",
        security: { trust: "community" },
      } as never);
    });
    const info = vi.fn(async (name: string) => {
      const tool = createToolRegistry().getTool(name);
      if (tool === undefined) throw new Error(`unknown tool in test: ${name}`);
      return ok({
        tool,
        manifest: { name, toolVersion: "1.0.0" } as unknown as ToolManifest,
        compatibility: null,
      });
    });
    const configure = vi.fn(async () =>
      ok({
        toolName: "x",
        dryRun: false,
        appliedTargets: [],
        verifiedTargets: [],
        skippedTargets: [],
        failedTargets: [],
      } as never),
    );

    const result = await runSetup({
      root,
      approve: true,
      selected: ["ripgrep", "semgrep"],
      toolkit: fakeToolkit({ install, info, configure }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls).toEqual(["ripgrep", "semgrep"]);
    expect(result.value.installs.map((item) => item.status)).toEqual(["installed", "installed"]);
    expect(result.value.atlasReady).toBe(true);
  });
});
