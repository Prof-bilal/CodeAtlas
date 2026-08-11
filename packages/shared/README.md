# @atlas/shared

The dependency-free foundation of CodeAtlas. This package owns the **base
types**, **constants**, and tiny **shared utilities** that every other package
relies on. It must never import from another `@atlas/*` package.

## Contents

- **Branded types** — `ProjectId`, `FilePath`, `SymbolId`, `NodeId`, `EdgeId`,
  `CacheKey` for type-safe domain values.
- **`Result<T, E>`** — a small functional `Result` type used as the uniform
  return shape across all ports.
- **Constants** — project `NAME` and `VERSION`.
- **Errors** — `ComingSoonError`, used by stub implementations until features
  are built.

## Rules

- No dependencies on other `@atlas/*` packages.
- No business logic — only what everyone else needs.
