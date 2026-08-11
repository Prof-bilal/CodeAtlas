import type { ToolRegistryPort } from "@atlas/core";
import { loadRegistry } from "@atlas/toolkit";

/** Options for {@link createToolRegistry}. */
export interface CreateToolRegistryOptions {
  /**
   * Path of a local overlay JSON file (private/community tools). Optional — the
   * shipped curated catalog is always loaded.
   */
  readonly overlayPath?: string;
  /**
   * Injected overlay data; takes precedence over `overlayPath`. Tests use this
   * to avoid writing fixture files.
   */
  readonly overlayData?: unknown;
  /**
   * Injected catalog data; defaults to the bundled curated catalog. Tests use
   * this to exercise the schema without shipping data.
   */
  readonly catalogData?: unknown;
}

/**
 * Create the Tool Registry (Task 19) — the authoritative, curated catalog of
 * open-source developer / AI-agent tools, merged with an optional local
 * overlay. Loads and validates eagerly: a malformed catalog/overlay throws.
 */
export function createToolRegistry(options: CreateToolRegistryOptions = {}): ToolRegistryPort {
  return loadRegistry({
    ...(options.catalogData !== undefined ? { catalogData: options.catalogData } : {}),
    ...(options.overlayPath !== undefined ? { overlayPath: options.overlayPath } : {}),
    ...(options.overlayData !== undefined ? { overlayData: options.overlayData } : {}),
  });
}
