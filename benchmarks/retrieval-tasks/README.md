# Held-out retrieval set (Phase 0 Task 3)

> Plan: `CODEATLAS-MCP-V2-IMPLEMENTATION-PLAN.md` §17 Phase 0.
> 30 tasks: 12 locate + 9 repair + 9 trace, each with file + symbol + hop
> ground truth. Frozen for P@1/5/10, MRR, R@k, chain-coverage gating.
> Rotate quarterly; keep a separate tuning/eval split before tuning on this.

## Schema (`tasks.json`)

```jsonc
{
  "id": "LOC-01",
  "category": "locate | repair | trace",
  "query": "natural-language task as an agent would phrase it",
  "fileTruth": ["repo-relative paths that answer it"],
  "symbolTruth": ["symbol names that answer it"],
  "hopTruth": 1,          // min graph hops from the best seed to cover truth
  "notes": "why this task discriminates a P0 gap"
}
```

## Running (informational in CI, blocking at Phase 6)

```bash
# Build the index for this repo, then score the set:
pnpm --filter @atlas/benchmark run build
node benchmarks/retrieval-tasks/evaluate.mjs --repo . --tasks benchmarks/retrieval-tasks/tasks.json
```

`evaluate.mjs` opens the repo's `.codeatlas/context.db` read-only through
`createContextSDK`, runs `search` + `dependencies.query(depth:2)` per task,
and reports P@1/5/10, MRR, R@10, chain-coverage. No provider, no network.
Baseline values are captured in `BASELINE.md` (Phase 0 Task 4) — deltas, not
absolutes, gate releases.

## Anti-overfitting

- Never tune ranking constants directly on this file; use a scratch split.
- Add new tasks with the quarter (`tasks-2026-Q4.json`) rather than editing
  these 30 in place once baselined.
