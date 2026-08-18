import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REGISTRY_SCHEMA_VERSION,
  RegistryLoadError,
  RegistrySchemaVersionError,
  RegistryValidationError,
  loadRegistry,
} from "../src";
import { validCatalog, validRecord } from "./helpers";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

const catalog = validCatalog([
  validRecord({ name: "shared-tool", version: "1.0.0", description: "catalog copy" }),
  validRecord({ name: "catalog-only", version: "2.0.0" }),
]);

const overlay = validCatalog([
  validRecord({ name: "shared-tool", version: "9.9.9", description: "overlay copy" }),
  validRecord({ name: "private-tool", version: "0.1.0" }),
]);

describe("RegistryStore merge (catalog + overlay)", () => {
  it("lets the overlay win per name and adds new tools", () => {
    const registry = loadRegistry({ catalogData: catalog, overlayData: overlay });
    const tools = registry.listTools();

    expect(tools).toHaveLength(3);
    expect(registry.getTool("shared-tool")?.version).toBe("9.9.9");
    expect(registry.getTool("private-tool")?.version).toBe("0.1.0");
    expect(registry.getTool("catalog-only")?.version).toBe("2.0.0");
  });

  it("records the source of every record", () => {
    const registry = loadRegistry({ catalogData: catalog, overlayData: overlay });
    expect(registry.recordSource("shared-tool")).toBe("overlay");
    expect(registry.recordSource("private-tool")).toBe("overlay");
    expect(registry.recordSource("catalog-only")).toBe("catalog");
    expect(registry.recordSource("missing")).toBeUndefined();
  });

  it("does not corrupt the curated catalog", () => {
    const merged = loadRegistry({ catalogData: catalog, overlayData: overlay });
    const plain = loadRegistry({ catalogData: catalog });

    // The catalog-only registry still carries the original values…
    expect(plain.getTool("shared-tool")?.version).toBe("1.0.0");
    expect(plain.getTool("shared-tool")?.description).toBe("catalog copy");
    expect(plain.getTool("private-tool")).toBeUndefined();

    // …and the merged registry's overlay record is a distinct object, not a
    // mutation of the catalog copy.
    expect(merged.getTool("shared-tool")).not.toBe(plain.getTool("shared-tool"));
  });

  it("merges categories from both layers, remaining extensible", () => {
    const categoryCatalog = validCatalog([
      validRecord({ name: "a", categories: ["Alpha", "Shared"] }),
    ]);
    const categoryOverlay = validCatalog([
      validRecord({ name: "b", categories: ["Shared", "Brand New"] }),
    ]);
    const registry = loadRegistry({ catalogData: categoryCatalog, overlayData: categoryOverlay });
    expect(registry.listCategories()).toEqual(["Alpha", "Shared", "Brand New"]);
  });
});

describe("loadRegistry fail-loudly contract", () => {
  it("throws on a malformed overlay record", () => {
    const badOverlay = validCatalog([validRecord({ name: "broken", license: "" })]);
    expect(() => loadRegistry({ catalogData: catalog, overlayData: badOverlay })).toThrow(
      RegistryValidationError,
    );
  });

  it("throws on a malformed catalog", () => {
    expect(() =>
      loadRegistry({ catalogData: { schemaVersion: REGISTRY_SCHEMA_VERSION, tools: "nope" } }),
    ).toThrow(RegistryValidationError);
  });

  it("throws on a schema version mismatch", () => {
    const future = validCatalog([validRecord()]);
    (future as Record<string, unknown>)["schemaVersion"] = REGISTRY_SCHEMA_VERSION + 1;
    expect(() => loadRegistry({ catalogData: future })).toThrow(RegistrySchemaVersionError);
  });

  it("throws when the overlay file cannot be read", () => {
    expect(() =>
      loadRegistry({ catalogData: catalog, overlayPath: join(tmpdir(), "missing-overlay.json") }),
    ).toThrow(RegistryLoadError);
  });

  it("throws when the overlay file contains invalid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-toolkit-"));
    tempDirs.push(dir);
    const overlayPath = join(dir, "overlay.json");
    writeFileSync(overlayPath, "{ not json", "utf8");
    expect(() => loadRegistry({ catalogData: catalog, overlayPath })).toThrow(RegistryLoadError);
  });

  it("loads a valid overlay file from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-toolkit-"));
    tempDirs.push(dir);
    const overlayPath = join(dir, "overlay.json");
    writeFileSync(overlayPath, JSON.stringify(overlay), "utf8");
    const registry = loadRegistry({ catalogData: catalog, overlayPath });
    expect(registry.getTool("private-tool")).toBeDefined();
    expect(registry.recordSource("private-tool")).toBe("overlay");
  });
});
