import { readFileSync } from "node:fs";
import type { ToolRegistryPort, ToolRegistryRecord, ToolRegistrySource } from "@atlas/core";
import shippedCatalogData from "./catalog.json";
import { RegistryLoadError } from "./errors";
import { RegistryStore } from "./registry-store";
import { REGISTRY_SCHEMA_VERSION, type ToolRegistryCatalog, validateCatalog } from "./schema";

/** Options for constructing a {@link ToolRegistryService}. */
export interface ToolRegistryServiceOptions {
  readonly store: RegistryStore;
}

/**
 * The Tool Registry (Task 19): the authoritative, curated catalog of what
 * exists. Implements `ToolRegistryPort` over the merged catalog + local
 * overlay. It only *describes* tools — install/compat/security evaluation
 * belongs to later Toolkit tasks.
 */
export class ToolRegistryService implements ToolRegistryPort {
  public readonly schemaVersion = REGISTRY_SCHEMA_VERSION;
  private readonly store: RegistryStore;

  public constructor(options: ToolRegistryServiceOptions) {
    this.store = options.store;
  }

  public listTools(): readonly ToolRegistryRecord[] {
    return this.store.list();
  }

  public getTool(name: string): ToolRegistryRecord | undefined {
    return this.store.get(name);
  }

  public listCategories(): readonly string[] {
    return this.store.categories();
  }

  public recordSource(name: string): ToolRegistrySource | undefined {
    return this.store.sourceOf(name);
  }
}

/** Options for {@link loadRegistry}. */
export interface LoadRegistryOptions {
  /**
   * Injected catalog data; defaults to the shipped curated catalog. Tests use
   * this to avoid touching the bundled data.
   */
  readonly catalogData?: unknown;
  /** Path of a local overlay JSON file (private/community tools). */
  readonly overlayPath?: string;
  /** Injected overlay data; takes precedence over `overlayPath`. */
  readonly overlayData?: unknown;
}

/**
 * Load, validate, and merge the curated catalog with the local overlay.
 *
 * Fail-loudly contract: a version mismatch, a malformed record, or an unreadable
 * overlay file throws (a `RegistrySchemaVersionError`, `RegistryValidationError`,
 * or `RegistryLoadError`) — nothing is silently skipped.
 */
export function loadRegistry(options: LoadRegistryOptions = {}): ToolRegistryService {
  const catalog = parseCatalog(options.catalogData ?? shippedCatalogData, "curated");
  const overlay = resolveOverlay(options);
  return new ToolRegistryService({
    store: new RegistryStore({
      catalog,
      overlay: overlay === undefined ? emptyCatalog() : parseCatalog(overlay, "user"),
    }),
  });
}

function parseCatalog(data: unknown, defaultSource: "curated" | "user"): ToolRegistryCatalog {
  const result = validateCatalog(data, REGISTRY_SCHEMA_VERSION, defaultSource);
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function resolveOverlay(options: LoadRegistryOptions): unknown | undefined {
  if (options.overlayData !== undefined) {
    return options.overlayData;
  }
  if (options.overlayPath !== undefined) {
    return readOverlayFile(options.overlayPath);
  }
  return undefined;
}

function readOverlayFile(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new RegistryLoadError(path, error);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new RegistryLoadError(path, error);
  }
}

function emptyCatalog(): ToolRegistryCatalog {
  return { schemaVersion: REGISTRY_SCHEMA_VERSION, records: [] };
}
