import { describe, expect, it } from "vitest";
import { ManifestSchemaVersionError, ManifestValidationError } from "../src/errors";
import {
  parseToolManifest,
  serializeToolManifest,
  validateToolManifest,
} from "../src/manifest-schema";
import { validToolManifestInput } from "./helpers";

describe("validateToolManifest", () => {
  it("accepts a valid manifest", () => {
    const result = validateToolManifest(validToolManifestInput());
    expect(result.ok).toBe(true);
  });

  it("rejects a manifest that is not an object", () => {
    for (const hostile of ["nope", 42, ["array"], null]) {
      const result = validateToolManifest(hostile);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ManifestValidationError);
      }
    }
  });

  it.each([
    ["name", { name: "   " }],
    ["description", { description: "" }],
    ["description", { description: undefined }],
    ["toolVersion", { toolVersion: 42 }],
    ["license", { license: undefined }],
    ["installation", { installation: undefined }],
    ["installation", { installation: "npm" }],
  ])("rejects a missing or invalid %s", (_field, override) => {
    const result = validateToolManifest(validToolManifestInput(override));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ManifestValidationError);
      if (result.error instanceof ManifestValidationError) {
        expect(result.error.problems.length).toBeGreaterThan(0);
      }
    }
  });

  it("rejects a schema version mismatch loudly", () => {
    const result = validateToolManifest(validToolManifestInput({ schemaVersion: 999 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ManifestSchemaVersionError);
    }
  });

  it("rejects an invalid installation type", () => {
    const result = validateToolManifest(
      validToolManifestInput({ installation: { type: "git", package: "x" } }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts every declared installation ecosystem", () => {
    const cases: Record<string, unknown> = {
      npm: { type: "npm", package: "some-pkg", versionRange: ">=1.0.0" },
      pip: { type: "pip", package: "some-pkg" },
      cargo: { type: "cargo", package: "some-crate" },
      go: { type: "go", package: "example.com/mod" },
      binary: { type: "binary", source: "https://example.com/tool.bin", checksum: "sha256:abc" },
      "github-release": { type: "github-release", package: "org/repo" },
      mcp: { type: "mcp", package: "@some/mcp-server" },
    };
    for (const [name, installation] of Object.entries(cases)) {
      const result = validateToolManifest(validToolManifestInput({ installation }));
      expect(result.ok).toBe(true);
      if (!result.ok) {
        expect(result.error.message).toContain(name);
      }
    }
  });

  it("defaults security, trust, verification, and integration state to honest values", () => {
    const result = validateToolManifest(validToolManifestInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.security).toEqual({
      status: "unverified",
      trust: "unverified",
      lastReview: null,
      note: null,
    });
    expect(result.value.verification).toEqual({ status: "unverified", checksum: null, note: null });
    expect(result.value.integrationState).toEqual({
      status: "unknown",
      expectedPath: null,
      foundPath: null,
      checkedAt: null,
      note: null,
    });
    expect(result.value.configuration).toEqual({
      type: "none",
      applied: [],
      agents: [],
      note: null,
    });
    expect(result.value.compatibility).toEqual({
      os: [],
      runtimes: [],
      agents: [],
      mcp: false,
      architecture: [],
      permissions: [],
      note: null,
    });
  });

  it("defaults provenance to manual with the installation method", () => {
    const result = validateToolManifest(validToolManifestInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.provenance).toEqual({
      source: "manual",
      sourceRef: null,
      method: "npm",
      command: null,
      recordedAt: "2026-08-11T10:00:00.000Z",
    });
  });

  it("accepts a fully recorded provenance", () => {
    const result = validateToolManifest(
      validToolManifestInput({
        provenance: {
          source: "registry",
          sourceRef: "biome",
          method: "npm",
          command: ["npm", "install", "-g", "biome"],
          recordedAt: "2026-08-11T10:00:00.000Z",
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown provenance source or method", () => {
    for (const override of [
      { provenance: { source: "git", method: "npm", recordedAt: "2026-08-11T10:00:00.000Z" } },
      {
        provenance: {
          source: "registry",
          method: "script",
          recordedAt: "2026-08-11T10:00:00.000Z",
        },
      },
    ]) {
      const result = validateToolManifest(validToolManifestInput(override));
      expect(result.ok).toBe(false);
    }
  });

  it("rejects provenance without a recordedAt timestamp", () => {
    const result = validateToolManifest(
      validToolManifestInput({
        provenance: { source: "registry", sourceRef: "biome", method: "npm" },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown security status or trust level", () => {
    for (const override of [
      { security: { status: "super-safe" } },
      { security: { trust: "super-trusted" } },
    ]) {
      const result = validateToolManifest(validToolManifestInput(override));
      expect(result.ok).toBe(false);
    }
  });

  it("accepts a reviewed security snapshot", () => {
    const result = validateToolManifest(
      validToolManifestInput({
        security: { status: "reviewed", trust: "reviewed", lastReview: "2026-08-01" },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.security.lastReview).toBe("2026-08-01");
    }
  });

  it("rejects invalid URLs for repository and documentation", () => {
    for (const field of ["repository", "documentation"]) {
      const result = validateToolManifest(validToolManifestInput({ [field]: "not-a-url" }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain(field);
      }
    }
  });

  it("accepts https URLs", () => {
    const result = validateToolManifest(
      validToolManifestInput({
        repository: "https://github.com/org/repo",
        documentation: "https://docs.example.com",
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("keeps categories and supported agents extensible", () => {
    const result = validateToolManifest(
      validToolManifestInput({
        categories: ["Quantum Context"],
        supportedAgents: ["claude", "custom-agent"],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.categories).toEqual(["Quantum Context"]);
      expect(result.value.supportedAgents).toEqual(["claude", "custom-agent"]);
    }
  });

  it("rejects an array containing an empty category", () => {
    const result = validateToolManifest(validToolManifestInput({ categories: ["ok", ""] }));
    expect(result.ok).toBe(false);
  });

  it("rejects invalid installedAt / updatedAt timestamps", () => {
    for (const field of ["installedAt", "updatedAt"]) {
      const result = validateToolManifest(validToolManifestInput({ [field]: "not-a-time" }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain(field);
      }
    }
  });

  it("rejects an unknown configuration type / verification status / integration status", () => {
    for (const override of [
      { configuration: { type: "magic" } },
      { verification: { status: "maybe" } },
      { integrationState: { status: "maybe" } },
    ]) {
      const result = validateToolManifest(validToolManifestInput(override));
      expect(result.ok).toBe(false);
    }
  });

  it("preserves unknown-but-well-formed top-level fields in extra", () => {
    const result = validateToolManifest(
      validToolManifestInput({ "x-custom": { deep: [1, 2] }, "y-note": "kept" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.extra).toEqual({ "x-custom": { deep: [1, 2] }, "y-note": "kept" });
    }
  });

  it("re-validating a parsed manifest does not re-nest the extra bucket", () => {
    const parsed = parseToolManifest(validToolManifestInput({ "x-custom": 42 }));
    const result = validateToolManifest(parsed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.extra).toEqual({ "x-custom": 42 });
    }
  });
});

describe("serializeToolManifest / parseToolManifest", () => {
  it("round-trips a manifest and preserves unknown fields", () => {
    const manifest = parseToolManifest(validToolManifestInput({ "x-custom": 42 }));
    const serialized = serializeToolManifest(manifest);
    expect(serialized.endsWith("\n")).toBe(true);

    const reparsed = parseToolManifest(serialized);
    expect(reparsed).toEqual(manifest);
    expect(reparsed.extra["x-custom"]).toBe(42);

    const onDisk = JSON.parse(serialized) as Record<string, unknown>;
    expect(onDisk["x-custom"]).toBe(42);
    expect(Object.prototype.hasOwnProperty.call(onDisk, "extra")).toBe(false);
  });

  it("serializes known fields in a stable order", () => {
    const manifest = parseToolManifest(validToolManifestInput());
    const parsed = JSON.parse(serializeToolManifest(manifest)) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys[0]).toBe("schemaVersion");
    expect(keys[1]).toBe("name");
    expect(keys).toContain("installation");
    expect(keys).toContain("updatedAt");
  });

  it("rejects non-JSON input with a typed error", () => {
    expect(() => parseToolManifest("{ not json")).toThrow(ManifestValidationError);
  });

  it("throws a schema version error for a newer/older version", () => {
    const raw = JSON.stringify(validToolManifestInput({ schemaVersion: 2 }));
    expect(() => parseToolManifest(raw)).toThrow(ManifestSchemaVersionError);
  });

  it("does not pollute Object.prototype with a hostile __proto__ key", () => {
    const base = JSON.parse(JSON.stringify(validToolManifestInput())) as Record<string, unknown>;
    Object.defineProperty(base, "__proto__", {
      value: { polluted: true },
      enumerable: true,
      writable: true,
      configurable: true,
    });

    const proto = Object.prototype as Record<string, unknown>;
    const manifest = parseToolManifest(base);
    expect(proto["polluted"]).toBeUndefined();
    expect(Object.getPrototypeOf(manifest.extra)).toBe(Object.prototype);

    const reparsed = JSON.parse(serializeToolManifest(manifest)) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(reparsed, "__proto__")).toBe(true);
    expect(proto["polluted"]).toBeUndefined();
  });
});
