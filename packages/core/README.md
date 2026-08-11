# @atlas/core

The **heart of the CodeAtlas domain**. This package owns the domain **entities**
and the **ports** (interfaces) that every feature package implements.

It contains **no infrastructure** — no file system access, database, HTTP, or
LLM calls. It only declares *what* the system can do; implementations live in
adapter packages (`scanner`, `parser`, `storage`, `graph`, `context`, `cache`,
`providers`) and are composed by the SDK.

## Domain entities

- `Project`, `SourceFile`, `Symbol`, `GraphNode`, `GraphEdge`, `ContextItem`

## Ports (plugin seams)

- `ScannerPort`, `ParserPort`, `StoragePort`, `GraphPort`, `ContextBuilderPort`,
  `CachePort`, `ProviderPort`

> These interfaces are the plugin contract. Any implementation that satisfies a
> port can be swapped in without touching consumers.
