import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ManifestLoadError,
  ManifestSchemaVersionError,
  ManifestValidationError,
} from "../src/errors";
import {
  TOOL_MANIFESTS_DIR_NAME,
  TOOL_MANIFEST_FILE_EXTENSION,
  createToolManifest,
  isValidToolName,
  listInstalledTools,
  loadToolManifest,
  saveToolManifest,
  toolManifestPath,
} from "../src/manifest";
import { type TempDir, createTempDir, validToolManifestInput, writeTempFile } from "./helpers";

const T1 = new Date("2026-08-11T10:00:00.000Z");
const T2 = new Date("2026-08-12T12:30:00.000Z");

function manifestForFixture(now: Date = T1) {
  return createToolManifest(
    {
      name: "fixture-tool",
      description: "A fixture tool used across the manifest integration tests.",
      toolVersion: "1.2.3",
      license: "MIT",
      categories: ["Developer Productivity"],
      supportedAgents: ["claude", "opencode"],
      installation: { type: "npm", package: "fixture-tool", versionRange: "^1.2.0" },
      security: { status: "community", trust: "community", lastReview: null, note: null },
    },
    { now },
  );
}

describe("createToolManifest", () => {
  it("builds a valid manifest with honest defaults and ISO timestamps", () => {
    const manifest = manifestForFixture();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.provenance).toEqual({
      source: "manual",
      sourceRef: null,
      method: "npm",
      command: null,
      recordedAt: T1.toISOString(),
    });
    expect(manifest.security.status).toBe("community");
    expect(manifest.verification.status).toBe("unverified");
    expect(manifest.integrationState.status).toBe("unknown");
    expect(manifest.installedAt).toBe(T1.toISOString());
    expect(manifest.updatedAt).toBe(T1.toISOString());
  });

  it("rejects invalid input loudly", () => {
    expect(() =>
      createToolManifest({
        name: "bad",
        description: "x",
        toolVersion: "1.0.0",
        license: "",
        installation: { type: "npm" },
      }),
    ).toThrow(ManifestValidationError);
  });
});

describe("saveToolManifest / loadToolManifest", () => {
  it("writes a fixture manifest to .codeatlas/tools/ and loads it back intact", async () => {
    const temp: TempDir = createTempDir();
    try {
      const manifest = manifestForFixture();
      const saved = await saveToolManifest(temp.root, manifest);
      expect(saved.ok).toBe(true);
      if (!saved.ok) return;

      const expectedPath = join(
        temp.root,
        ".codeatlas",
        TOOL_MANIFESTS_DIR_NAME,
        `fixture-tool${TOOL_MANIFEST_FILE_EXTENSION}`,
      );
      expect(saved.value.path).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBe(true);

      const raw = readFileSync(expectedPath, "utf8");
      expect(raw).toContain('"schemaVersion"');
      expect(raw.endsWith("\n")).toBe(true);

      const loaded = await loadToolManifest(expectedPath);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok || loaded.value === null) return;
      expect(loaded.value.name).toBe("fixture-tool");
      expect(loaded.value.toolVersion).toBe("1.2.3");
      expect(loaded.value.installation).toEqual({
        type: "npm",
        package: "fixture-tool",
        source: null,
        checksum: null,
        versionRange: "^1.2.0",
        note: null,
      });
      expect(loaded.value).toEqual(saved.value.manifest);
    } finally {
      temp.cleanup();
    }
  });

  it("preserves installedAt but refreshes updatedAt across saves", async () => {
    const temp: TempDir = createTempDir();
    try {
      const first = await saveToolManifest(temp.root, manifestForFixture(T1), { now: T1 });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value.manifest.updatedAt).toBe(T1.toISOString());

      const second = await saveToolManifest(temp.root, manifestForFixture(T2), { now: T2 });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.manifest.installedAt).toBe(T1.toISOString());
      expect(second.value.manifest.updatedAt).toBe(T2.toISOString());
    } finally {
      temp.cleanup();
    }
  });

  it("preserves unknown fields across a save → load round trip", async () => {
    const temp: TempDir = createTempDir();
    try {
      const manifest = createToolManifest(
        {
          name: "fixture-tool",
          description: "A fixture tool with an extra field.",
          toolVersion: "1.2.3",
          license: "MIT",
          installation: { type: "npm", package: "fixture-tool" },
          extra: { "x-custom": { kept: true } },
        },
        { now: T1 },
      );
      const saved = await saveToolManifest(temp.root, manifest);
      expect(saved.ok).toBe(true);
      if (!saved.ok) return;

      const loaded = await loadToolManifest(saved.value.path);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok || loaded.value === null) return;
      expect(loaded.value.extra).toEqual({ "x-custom": { kept: true } });
      expect(JSON.parse(readFileSync(saved.value.path, "utf8"))).toHaveProperty("x-custom");
    } finally {
      temp.cleanup();
    }
  });

  it("returns ok(null) for a missing manifest file", async () => {
    const loaded = await loadToolManifest(join("C:/definitely-not-a-path", "nope.json"));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value).toBeNull();
    }
  });

  it("fails with a clear typed error on corrupted JSON, never crashes", async () => {
    const temp: TempDir = createTempDir();
    try {
      writeTempFile(temp.root, ".codeatlas/tools/broken.json", "{ not json");
      const loaded = await loadToolManifest(toolManifestPath(temp.root, "broken"));
      expect(loaded.ok).toBe(false);
      if (!loaded.ok) {
        expect(loaded.error).toBeInstanceOf(ManifestValidationError);
        expect(loaded.error.message).toContain("JSON");
      }
    } finally {
      temp.cleanup();
    }
  });

  it("fails with a typed error on a schema version mismatch on disk", async () => {
    const temp: TempDir = createTempDir();
    try {
      const raw = JSON.stringify(validToolManifestInput({ schemaVersion: 2 }));
      writeTempFile(temp.root, ".codeatlas/tools/fixture-tool.json", raw);
      const loaded = await loadToolManifest(toolManifestPath(temp.root, "fixture-tool"));
      expect(loaded.ok).toBe(false);
      if (!loaded.ok) {
        expect(loaded.error).toBeInstanceOf(ManifestSchemaVersionError);
      }
    } finally {
      temp.cleanup();
    }
  });

  it("rejects hostile non-object content with a clear error", async () => {
    const temp: TempDir = createTempDir();
    try {
      for (const content of ["[1, 2, 3]", "42", '"a string"']) {
        writeTempFile(temp.root, ".codeatlas/tools/fixture-tool.json", content);
        const loaded = await loadToolManifest(toolManifestPath(temp.root, "fixture-tool"));
        expect(loaded.ok).toBe(false);
        if (!loaded.ok) {
          expect(loaded.error).toBeInstanceOf(ManifestValidationError);
        }
      }
    } finally {
      temp.cleanup();
    }
  });

  it("rejects an oversized manifest without trying to read it", async () => {
    const temp: TempDir = createTempDir();
    try {
      const blob = "x".repeat(1024 * 1024 + 256);
      const oversized = JSON.stringify(validToolManifestInput({ blob }));
      writeTempFile(temp.root, ".codeatlas/tools/fixture-tool.json", oversized);
      const loaded = await loadToolManifest(toolManifestPath(temp.root, "fixture-tool"));
      expect(loaded.ok).toBe(false);
      if (!loaded.ok) {
        expect(loaded.error).toBeInstanceOf(ManifestLoadError);
        expect(loaded.error.message).toContain("exceeds");
      }
    } finally {
      temp.cleanup();
    }
  });

  it("validates the manifest before any write — invalid input never reaches disk", async () => {
    const temp: TempDir = createTempDir();
    try {
      const manifest = { ...manifestForFixture(), toolVersion: "" };
      const saved = await saveToolManifest(temp.root, manifest);
      expect(saved.ok).toBe(false);
      if (!saved.ok) {
        expect(saved.error).toBeInstanceOf(ManifestValidationError);
      }
      const expectedPath = toolManifestPath(temp.root, "fixture-tool");
      expect(existsSync(expectedPath)).toBe(false);
    } finally {
      temp.cleanup();
    }
  });

  it("rejects a hostile __proto__ file without polluting Object.prototype", async () => {
    const temp: TempDir = createTempDir();
    try {
      const base = JSON.parse(JSON.stringify(validToolManifestInput())) as Record<string, unknown>;
      Object.defineProperty(base, "__proto__", {
        value: { polluted: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });
      writeTempFile(temp.root, ".codeatlas/tools/fixture-tool.json", JSON.stringify(base));

      const loaded = await loadToolManifest(toolManifestPath(temp.root, "fixture-tool"));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok || loaded.value === null) return;
      const proto = Object.prototype as Record<string, unknown>;
      expect(proto["polluted"]).toBeUndefined();
      expect(Object.getPrototypeOf(loaded.value.extra)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(loaded.value.extra, "__proto__")).toBe(true);
    } finally {
      temp.cleanup();
    }
  });
});

describe("tool name safety & listing", () => {
  it("validates tool names for safe file names", () => {
    expect(isValidToolName("biome")).toBe(true);
    expect(isValidToolName("github-mcp-server")).toBe(true);
    expect(isValidToolName("tool_1")).toBe(true);
    expect(isValidToolName("../evil")).toBe(false);
    expect(isValidToolName("a/b")).toBe(false);
    expect(isValidToolName("")).toBe(false);
    expect(isValidToolName("x y")).toBe(false);
  });

  it("toolManifestPath refuses names that could escape the tools directory", () => {
    for (const bad of ["../evil", "a/b", "..", ""]) {
      expect(() => toolManifestPath("C:/root", bad)).toThrow(ManifestValidationError);
    }
    expect(toolManifestPath("C:/root", "biome")).toBe(
      join("C:/root", ".codeatlas", "tools", "biome.json"),
    );
  });

  it("saveToolManifest fails for an unsafe tool name without writing anything", async () => {
    const temp: TempDir = createTempDir();
    try {
      const manifest = createToolManifest({
        name: "../evil",
        description: "attempted traversal",
        toolVersion: "1.0.0",
        license: "MIT",
        installation: { type: "npm", package: "evil" },
      });
      const saved = await saveToolManifest(temp.root, manifest);
      expect(saved.ok).toBe(false);
      if (!saved.ok) {
        expect(saved.error).toBeInstanceOf(ManifestValidationError);
      }
      expect(existsSync(join(temp.root, ".codeatlas", "tools"))).toBe(false);
    } finally {
      temp.cleanup();
    }
  });

  it("listInstalledTools returns the names of installed manifests", async () => {
    const temp: TempDir = createTempDir();
    try {
      await saveToolManifest(temp.root, manifestForFixture());
      await saveToolManifest(
        temp.root,
        createToolManifest({
          name: "second-tool",
          description: "Another installed tool.",
          toolVersion: "2.0.0",
          license: "Apache-2.0",
          installation: { type: "pip", package: "second-tool" },
        }),
      );
      const result = await listInstalledTools(temp.root);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(expect.arrayContaining(["fixture-tool", "second-tool"]));
      }
    } finally {
      temp.cleanup();
    }
  });

  it("listInstalledTools returns an empty list when nothing is installed", async () => {
    const temp: TempDir = createTempDir();
    try {
      const result = await listInstalledTools(temp.root);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    } finally {
      temp.cleanup();
    }
  });

  it("listInstalledTools ignores files that are not manifests", async () => {
    const temp: TempDir = createTempDir();
    try {
      writeTempFile(temp.root, ".codeatlas/tools/not-a-manifest.txt", "hi");
      const result = await listInstalledTools(temp.root);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    } finally {
      temp.cleanup();
    }
  });
});
