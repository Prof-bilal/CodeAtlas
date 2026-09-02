# ADR-016: Regime-Aware Context Modes

**Status:** Accepted  
**Date:** 2026-09-02  
**Context:** Phase B implementation addressing axios +220% token overhead with flat accuracy

## Decision

Implement automatic context mode selection based on repository size to prevent token explosion on medium-to-large repositories where models don't benefit from exhaustive context.

### Modes

- **`auto`** (default): select mode based on repo size
  - <= 800 files → `full` (standard assembly; small/mid repos fit comfortably)
  - \> 800 files → `digest` (prevent token explosion on large repos)
- **`digest`**: include only digest item + top-5 search results (skip dependency chains, overview)
  - Budget: 10 items, 8000 tokens total
- **`full`**: current behavior (all items, dependency chains, full assembly)
- **`off`**: return empty package (baseline mode)

> **Amendment (2026-09-02, post-implementation):** the original thresholds sent
> repos < 200 files to `digest`. This was reverted after the MCP
> `context-correctness` suite caught a real recall regression: on a small
> fixture repo, digest's 10-item budget dropped `routes.ts` from an open-ended
> discovery task's results. Small repos fit comfortably in `full`, so digesting
> them loses recall for no token benefit. Digest is now strictly a
> large-repo token-protection measure (> 800 files), and is also explicitly
> selectable per call via the `find_relevant_context` `contextMode` parameter
> (recommended for smaller/weaker models that need tighter, pre-digested
> packages).

### Implementation Points

1. Add `ContextMode` type to `core/ports/context.port.ts`
2. Add `contextMode` parameter to `AssembleOptions` in `assemble.ts`
3. Implement mode selection before `collectSelections()`
4. Wire through MCP `find_relevant_context` handler (with the sufficiency gate driving `auto-escalate`: start `digest`, re-assemble with `full` only when the full package satisfies the gate)
5. Wire through CLI `atlas context` command with `--context-mode` flag (`build`/`launch`/`attach`/`export` and the standalone `atlas <agent>` launch commands)

## Rationale

Phase A benchmarking found that axios (466 files) shows +220% token overhead with flat accuracy. Small repos (winston, 116 files) show smaller overhead. The model doesn't benefit from exhaustive context on medium repos.

Digest mode provides architectural overview plus targeted retrieval without overwhelming the context window.

## Consequences

- Reduces token overhead on medium-to-large repos
- Maintains full context mode for repos where it helps
- Allows explicit mode override via CLI/MCP parameter
- Backward compatible (auto mode is default)
