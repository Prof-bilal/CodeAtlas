import { describe, expect, it } from "vitest";
import { RegistrySchemaVersionError, RegistryValidationError } from "../src/errors";
import {
  DEFAULT_CATEGORIES,
  REGISTRY_SCHEMA_VERSION,
  validateCatalog,
  validateOverlay,
  validateToolRecord,
} from "../src/schema";
import { validCatalog, validRecord } from "./helpers";

describe("validateToolRecord", () => {
  it("accepts a valid record", () => {
    const result = validateToolRecord(validRecord());
    expect(result.ok).toBe(true);
  });

  it("rejects a record that is not an object", () => {
    const result = validateToolRecord("nope");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RegistryValidationError);
    }
  });

  it.each([
    ["name", { name: "   " }],
    ["description", { description: "" }],
    ["license", { license: undefined }],
    ["version", { version: 42 }],
    ["categories", { categories: undefined }],
    ["categories", { categories: [] }],
    ["categories", { categories: ["ok", ""] }],
  ])("rejects a missing or invalid %s", (_field, override) => {
    const result = validateToolRecord(validRecord(override));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RegistryValidationError);
      if (result.error instanceof RegistryValidationError) {
        expect(result.error.problems.length).toBeGreaterThan(0);
      }
    }
  });

  it("rejects an invalid URL for repository/website/documentation", () => {
    for (const field of ["repository", "website", "documentation"]) {
      const result = validateToolRecord(validRecord({ [field]: "not-a-url" }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain(field);
      }
    }
  });

  it("accepts https URLs", () => {
    const result = validateToolRecord(validRecord({ repository: "https://github.com/x/y" }));
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid install method type", () => {
    const result = validateToolRecord(validRecord({ installMethods: [{ type: "git" }] }));
    expect(result.ok).toBe(false);
  });

  it("accepts every declared install method type", () => {
    const result = validateToolRecord(
      validRecord({
        installMethods: [
          { type: "npm", packageId: "some-pkg" },
          { type: "pip" },
          { type: "cargo" },
          { type: "go" },
          { type: "binary", note: "prebuilt" },
          { type: "github-release", packageId: "org/repo" },
          { type: "mcp" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.installMethods).toHaveLength(7);
    }
  });

  it("rejects an unknown security status", () => {
    const result = validateToolRecord(validRecord({ security: { status: "super-safe" } }));
    expect(result.ok).toBe(false);
  });

  it("accepts a reviewed status with a review date", () => {
    const result = validateToolRecord(
      validRecord({ security: { status: "reviewed", lastReview: "2026-08-01" } }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.security).toEqual({
        status: "reviewed",
        lastReview: "2026-08-01",
      });
    }
  });

  it("rejects an unknown trust level", () => {
    const result = validateToolRecord(validRecord({ trust: "super-trusted" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a negative star count", () => {
    const result = validateToolRecord(validRecord({ stars: -5 }));
    expect(result.ok).toBe(false);
  });

  it("keeps categories extensible — a brand-new category is valid", () => {
    const result = validateToolRecord(validRecord({ categories: ["Quantum Context"] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.categories).toEqual(["Quantum Context"]);
    }
  });

  it("defaults security and trust to unverified (honest default)", () => {
    const result = validateToolRecord(validRecord());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.security.status).toBe("unverified");
      expect(result.value.trust).toBe("unverified");
    }
  });
});

describe("provenance", () => {
  it("records default provenance for every field", () => {
    const result = validateToolRecord(validRecord(), "curated");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const provenance = result.value.provenance;
    expect(provenance.name).toEqual({ source: "curated" });
    expect(provenance.version).toEqual({ source: "curated" });
    expect(provenance.record).toEqual({ source: "curated" });
    expect(provenance.stars).toEqual({ source: "curated" });
  });

  it("honors per-field provenance overrides with notes", () => {
    const result = validateToolRecord(
      validRecord({
        stars: 1234,
        provenance: {
          version: { source: "external", note: "npm registry, not verified" },
          stars: { source: "external" },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const provenance = result.value.provenance;
    expect(provenance.version).toEqual({ source: "external", note: "npm registry, not verified" });
    expect(provenance.stars).toEqual({ source: "external" });
    // Untouched fields keep the default.
    expect(provenance.name).toEqual({ source: "curated" });
    expect(provenance.description).toEqual({ source: "curated" });
  });

  it("rejects an unknown provenance field", () => {
    const result = validateToolRecord(
      validRecord({ provenance: { bogus: { source: "external" } } }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid provenance source", () => {
    const result = validateToolRecord(
      validRecord({ provenance: { version: { source: "trusted" } } }),
    );
    expect(result.ok).toBe(false);
  });

  it("uses user provenance for overlay records", () => {
    const result = validateOverlay(
      validCatalog([validRecord({ name: "private-tool" })]),
      REGISTRY_SCHEMA_VERSION,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.records[0].provenance.record).toEqual({ source: "user" });
      expect(result.value.records[0].provenance.name).toEqual({ source: "user" });
    }
  });
});

describe("validateCatalog", () => {
  it("validates a whole catalog and aggregates every failure", () => {
    const result = validateCatalog(
      validCatalog([
        validRecord(),
        validRecord({ name: "second" }),
        validRecord({ name: "broken", license: "" }),
      ]),
      REGISTRY_SCHEMA_VERSION,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RegistryValidationError);
      if (result.error instanceof RegistryValidationError) {
        expect(result.error.problems).toHaveLength(1);
        expect(result.error.problems[0]).toContain("broken");
      }
    }
  });

  it("rejects a schema version mismatch loudly", () => {
    const result = validateCatalog(validCatalog([validRecord()]), 999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RegistrySchemaVersionError);
    }
  });

  it("rejects a payload without a tools array", () => {
    const result = validateCatalog(
      { schemaVersion: REGISTRY_SCHEMA_VERSION },
      REGISTRY_SCHEMA_VERSION,
    );
    expect(result.ok).toBe(false);
  });
});

describe("DEFAULT_CATEGORIES", () => {
  it("documents the suggested starting categories", () => {
    expect(DEFAULT_CATEGORIES).toContain("Context");
    expect(DEFAULT_CATEGORIES).toContain("Token Optimization");
    expect(DEFAULT_CATEGORIES).toContain("MCP");
    expect(DEFAULT_CATEGORIES).toContain("Code Analysis");
    expect(DEFAULT_CATEGORIES).toContain("Testing");
    expect(DEFAULT_CATEGORIES).toContain("AI Quality");
    expect(DEFAULT_CATEGORIES).toContain("Agent Tools");
    expect(DEFAULT_CATEGORIES).toContain("CLI Utilities");
    expect(DEFAULT_CATEGORIES).toContain("Developer Productivity");
  });
});
