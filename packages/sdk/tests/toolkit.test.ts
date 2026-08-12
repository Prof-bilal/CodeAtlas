import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { CompatibilityPort, CompatibilityReport } from "@atlas/core";
import { type Result, ok } from "@atlas/shared";
import { InstallerProcess, type InstallerSpawnFn } from "@atlas/toolkit";
import { afterEach, describe, expect, it } from "vitest";
import {
  EnvironmentDetector,
  RegistryValidationError,
  createCompatibilityEngine,
  createInstaller,
  createToolRegistry,
} from "../src/index";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

const overlayPayload = {
  schemaVersion: 1,
  tools: [
    {
      name: "private-tool",
      description: "A private team tool added via the local overlay.",
      license: "MIT",
      version: "0.1.0",
      categories: ["Developer Productivity"],
    },
  ],
};

describe("createToolRegistry (SDK surface)", () => {
  it("loads the shipped curated catalog with no options", () => {
    const registry = createToolRegistry();
    expect(registry.schemaVersion).toBe(1);
    expect(registry.listTools().length).toBeGreaterThan(0);
    expect(registry.listCategories()).toContain("MCP");
    expect(registry.listCategories()).toContain("Developer Productivity");
    expect(registry.recordSource("biome")).toBe("catalog");
  });

  it("merges a temp overlay file over the shipped catalog", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-sdk-toolkit-"));
    tempDirs.push(dir);
    const overlayPath = join(dir, "overlay.json");
    writeFileSync(overlayPath, JSON.stringify(overlayPayload), "utf8");

    const registry = createToolRegistry({ overlayPath });
    expect(registry.getTool("private-tool")?.version).toBe("0.1.0");
    expect(registry.recordSource("private-tool")).toBe("overlay");
    // The shipped catalog is still present underneath.
    expect(registry.getTool("biome")).toBeDefined();
  });

  it("accepts injected overlay data", () => {
    const registry = createToolRegistry({ overlayData: overlayPayload });
    expect(registry.getTool("private-tool")).toBeDefined();
    expect(registry.recordSource("private-tool")).toBe("overlay");
  });

  it("lets an overlay override a curated tool", () => {
    const registry = createToolRegistry({
      overlayData: {
        schemaVersion: 1,
        tools: [
          {
            name: "biome",
            description: "A locally pinned variant of biome.",
            license: "MIT",
            version: "9.9.9",
            categories: ["Developer Productivity"],
          },
        ],
      },
    });
    expect(registry.getTool("biome")?.version).toBe("9.9.9");
    expect(registry.recordSource("biome")).toBe("overlay");
  });

  it("fails loudly on a malformed overlay", () => {
    expect(() =>
      createToolRegistry({
        overlayData: { schemaVersion: 1, tools: [{ name: "broken", license: "" }] },
      }),
    ).toThrow(RegistryValidationError);
  });

  it("returns undefined for an unknown tool", () => {
    const registry = createToolRegistry();
    expect(registry.getTool("does-not-exist")).toBeUndefined();
  });
});

describe("createCompatibilityEngine (SDK surface)", () => {
  it("returns a working CompatibilityPort that evaluates declared requirements", async () => {
    const engine = createCompatibilityEngine({
      environment: new EnvironmentDetector({
        platform: "win32",
        arch: "x64",
        nodeVersion: "v22.14.0",
        findExecutable: (binary) => (binary === "node" ? "C:\\bin\\node.exe" : null),
      }),
    });
    const result = await engine.evaluate({
      toolName: "fixture-tool",
      toolVersion: "1.0.0",
      requirements: {
        os: ["win32"],
        runtimes: [{ name: "node", versionRange: ">=20.19.0" }],
        agents: [],
        mcp: false,
        architecture: ["x64"],
        permissions: [],
      },
      installMethod: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.overall).toBe("compatible");
    expect(result.value.notInstallable).toBe(false);
  });
});

describe("createInstaller (SDK surface)", () => {
  it("returns an InstallerPort and plans an npm install without executing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-sdk-installer-"));
    tempDirs.push(dir);

    const compat: CompatibilityPort = {
      async evaluate(): Promise<Result<CompatibilityReport>> {
        return ok({
          toolName: "fixture-tool",
          toolVersion: "1.0.0",
          overall: "compatible",
          notInstallable: false,
          checks: [],
        });
      },
    };

    const calls: { command: string; args: readonly string[]; shell?: boolean }[] = [];
    const spawnFn: InstallerSpawnFn = (command, args, options) => {
      calls.push({ command, args, shell: options.shell });
      const stream = new Readable({ read() {} });
      stream.push(null);
      const proc = {
        pid: 1,
        stdout: stream,
        stderr: stream,
        kill: () => true,
        on: (event: string, listener: unknown) => {
          if (event === "close") {
            (listener as (c: number | null) => void)(0);
          }
          return proc;
        },
      };
      return proc;
    };
    const process = new InstallerProcess({ spawnFn, defaultTimeoutMs: 1000 });

    const installer = createInstaller({
      compatibility: compat,
      process,
      resolveBinary: () => null,
      readVersion: () => null,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    });

    const plan = await installer.plan({
      name: "fixture-tool",
      description: "A fixture.",
      toolVersion: "1.0.0",
      installation: {
        type: "npm",
        package: "fixture-tool",
        source: null,
        checksum: null,
        versionRange: null,
      },
      security: { status: "unverified", trust: "unverified" },
      compatibility: {
        toolName: "fixture-tool",
        toolVersion: "1.0.0",
        requirements: {
          os: [],
          runtimes: [],
          agents: [],
          mcp: false,
          architecture: [],
          permissions: [],
        },
        installMethod: null,
      },
      cwd: dir,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.value.command).toEqual({
      binary: "npm",
      args: ["install", "--global", "fixture-tool"],
      cwd: dir,
    });
    expect(calls.length).toBe(0); // plan never executes
    expect(installer.implementedTypes).toEqual(["npm", "pip", "cargo", "go"]);
  });
});
