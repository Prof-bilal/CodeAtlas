/** A valid minimal record used across the registry tests. */
export function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "test-tool",
    description: "A tool for exercising the registry schema.",
    license: "MIT",
    version: "1.0.0",
    categories: ["Developer Productivity"],
    ...overrides,
  };
}

/** A minimal catalog/overlay payload at the current schema version. */
export function validCatalog(tools: readonly unknown[]): Record<string, unknown> {
  return { schemaVersion: 1, tools };
}
