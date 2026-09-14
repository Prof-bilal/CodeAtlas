import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSetup } from "../src/setup";

const tempDirs: string[] = [];

afterEach(() => {
  // Vitest's temp directories are intentionally left to the OS; no project files
  // are removed by this test suite.
  tempDirs.length = 0;
});

describe("runSetup", () => {
  it("makes evidence-based frontend recommendations without installing in dry-run mode", async () => {
    const root = mkdtempSync(join("/tmp", "atlas-setup-"));
    tempDirs.push(root);
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { react: "19.0.0", vite: "6.0.0" } }),
    );

    const result = await runSetup({ root, dryRun: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.profile.frontend).toBe(true);
    expect(result.value.recommendations.map((item) => item.id)).toEqual([
      "playwright-cli",
      "webapp-testing",
      "react-best-practices",
    ]);
    expect(result.value.installs.every((item) => item.status === "planned")).toBe(true);
    expect(result.value.validation.every((item) => item.status === "planned")).toBe(true);
    expect(result.value.atlas.banner).toBe("ATLAS SETUP INCOMPLETE");
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
});
