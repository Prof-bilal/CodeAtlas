import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveAtlasCli, runAtlas } from "../src/atlas-cli";

afterEach(() => {
  delete process.env["ATLAS_CLI_JS"];
});

describe("resolveAtlasCli", () => {
  it("finds the built CLI in the monorepo", () => {
    const cli = resolveAtlasCli(process.cwd());
    expect(cli).not.toBeNull();
    expect(existsSync(cli as string)).toBe(true);
  });

  it("prefers the ATLAS_CLI_JS override", () => {
    process.env["ATLAS_CLI_JS"] = "C:/custom/atlas.js";
    expect(resolveAtlasCli(process.cwd())).toBe("C:/custom/atlas.js");
  });

  it("returns null when no CLI can be located", () => {
    const far = mkdtempSync(join(tmpdir(), "atlas-cli-probe-"));
    try {
      expect(resolveAtlasCli(far)).toBeNull();
    } finally {
      rmSync(far, { recursive: true, force: true });
    }
  });
});

describe("runAtlas", () => {
  it("invokes the CLI and captures its output", async () => {
    process.env["ATLAS_CLI_JS"] = resolve(process.cwd(), "apps", "cli", "dist", "index.js");
    const result = await runAtlas({
      projectRoot: process.cwd(),
      command: "--version",
      timeoutMs: 30_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  }, 60_000);
});
