# ADR-017: Synthesis Tier — from retrieval to computed conclusions

**Status:** Accepted (implemented 2026-09-02)
**Date:** 2026-09-02
**Context:** Phase B validation (benchmarks `oc-mimo-axios`, `hard-nemotron-*`)
showed flat accuracy when the context engine delivers only *retrieval* (ranked file
excerpts) to any model. Weak models over-explore and never conclude; frontier
models need little help reasoning. The engine already computes code-structure
reasoning (graph, parser, summary) but does not expose it as conclusions.

## Decision

Add a **synthesis tier** to the context package: for tasks served under a
`digest`/weak-model context mode, the package leads with a **computed conclusion**
(dependency path, fault-site + evidence chain, module map, or expanded file set)
produced deterministically from the graph + summaries + parser, followed by the
supporting excerpts. `full`/frontier mode keeps today's retrieval-first behavior.

Calibrate by context mode:
- `full` / frontier-style model → ranked excerpts, model reasons (current).
- `digest` / weak-style model → **synthesis-led**: engine states a conclusion,
  model verifies + presents. Footer scaffolds: *"The engine has analyzed the code
  structure and concluded X — verify it and present the answer, citing these files."*

This converts a reasoning task (weak models fail) into a verification task
(weak models succeed).

## Implementation (2026-09-02, accepted)

- `ContextPackage.synthesis?: ContextSynthesis` — { kind, conclusion, evidence[],
  centralFiles[] } — `ContextSynthesisKind` ∈ dependency-path | fault-site |
  module-map | file-set.
- `packages/sdk/src/context-integration/synthesis.ts`: `synthesize()` dispatches
  by classifier category. `dependency-path` computes a **real BFS shortest path**
  through the dependency graph between the two central files (both edge
  directions); `fault-site` ranks candidate files + appends their in-callers
  (classic fault localization); `module-map` maps central files + summaries.
- `assemble.ts` produces synthesis **only when `effectiveMode === "digest"`**;
  full/auto→full mode is untouched (benchmark-identical).
- `find_relevant_context` (MCP) returns `synthesis` (schema + description added)
  and honors `contextMode` param; `ATLAS_CONTEXT_MODE` env forces a mode for all
  calls (forwarded by the opencode benchmark runner, so `ATLAS_CONTEXT_MODE=digest`
  arms the synthesis path for weak-model benchmark runs).

## Why now

Phase B evidence:
- Strength experiment: 0/8 lifts with retrieval-only; the two regressions were
  unbounded exploration with no concluding answer.
- Accuracy is flat because weak models get the files they could grep themselves
  but cannot reason over them; frontier models need no help reasoning.
- The real value proposition is **gap-closure**: weak + synthesis vs frontier-only,
  not weak+context vs weak-baseline.

## Consequences

- Weak models can approach frontier output quality on structure-query tasks
  (dependency-tracing, bug-investigation, repo-understanding, file-discovery)
  because the engine supplies the reasoning that requires multi-hop graph traversal.
- Adds a conclusion + evidence-chain shape to the context package schema.
- Benchmark §"value prop" becomes gap-closure (weak+synthesis vs frontier-only).
- More synthesis is computable offline and cached (graph + summaries are indexed).
- Synthesis is **always deterministic and verifiable** — the agent is told to
  verify, never to trust. No AI generation in the package itself.
