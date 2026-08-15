# @atlas/context

Implements `ContextBuilderPort` from `@atlas/core`: ranks files/symbols and
assembles the prompt context sent to a language model.

`ContextBuilderService` is a deterministic rank-and-assemble step (ADR-001
"Deterministic Before AI"): `build(query, limit?)` refreshes the injected
`SearchPort`, runs a ranked search over the indexed context, and maps each hit
that carries a resolvable source path to a `ContextItem { source, content,
score }`, deduplicating by source file and keeping the highest score.
`sourceFile(path)` returns one file's content as a single item. No AI is
involved.