import type { ToolRegistryRecord, ToolRegistrySource } from "@atlas/core";
import type { ToolRegistryCatalog } from "./schema";

/** Options for constructing a {@link RegistryStore}. */
export interface RegistryStoreOptions {
  /** The validated curated catalog (ships with the package). */
  readonly catalog: ToolRegistryCatalog;
  /** The validated local overlay (user/community tools). May be empty. */
  readonly overlay: ToolRegistryCatalog;
}

/**
 * The registry store: the **curated catalog plus the local overlay**, merged by
 * record name. Overlay records win over catalog records of the same name
 * without ever mutating the shipped catalog. Records are already validated by
 * the caller — a malformed record can never reach this layer.
 */
export class RegistryStore {
  private readonly records = new Map<string, ToolRegistryRecord>();
  private readonly sources = new Map<string, ToolRegistrySource>();

  public constructor(options: RegistryStoreOptions) {
    for (const record of options.catalog.records) {
      this.records.set(record.name, record);
      this.sources.set(record.name, "catalog");
    }
    for (const record of options.overlay.records) {
      this.records.set(record.name, record);
      this.sources.set(record.name, "overlay");
    }
  }

  /** All merged records, catalog first then overlay additions. */
  public list(): readonly ToolRegistryRecord[] {
    return [...this.records.values()];
  }

  /** One record by name (overlay wins), or `undefined`. */
  public get(name: string): ToolRegistryRecord | undefined {
    return this.records.get(name);
  }

  /** Which layer a record came from, or `undefined` when unknown. */
  public sourceOf(name: string): ToolRegistrySource | undefined {
    return this.sources.get(name);
  }

  /** The distinct category set across all records (insertion order). */
  public categories(): readonly string[] {
    const seen = new Set<string>();
    for (const record of this.records.values()) {
      for (const category of record.categories) {
        seen.add(category);
      }
    }
    return [...seen];
  }
}
