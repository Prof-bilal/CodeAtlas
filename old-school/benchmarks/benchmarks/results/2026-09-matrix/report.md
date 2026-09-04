# Benchmark matrix — oc/mimo + oc/nemotron (model-under-test)

Generated 2026-09-01 → updated live as results land. Two free-tier models
compared on the **winston** repo (`benchmarks/final-2026-08/repos/repo-01`,
~116 files, 3 arms × 9 tasks). CodeAtlas context injection toggles across
`baseline` (none) / `codeatlas` (context) / `codeatlas-intel` (budgeted context).

## oc/mimo (mimo-v2.5-free) — COMPLETE (107/107 task-runs across 4 repos)

Deep view, winston only:

| repo     | arm            | acc | tokens  | Δ vs baseline | tools | errs/to |
|----------|----------------|-----|---------|---------------|-------|---------|
| winston  | baseline       | 1.56| 1,278K  | —             | 97    | 0/1     |
| winston  | codeatlas      | 1.56| 2,609K  | +1,331K       | 159   | 0/0     |
| winston  | codeatlas-intel| 1.44| 1,578K  | **+300K**     | 147   | 0/1     |

**Reading (mimo):** baseline already solves winston's shallow citation tasks, so
CodeAtlas can't raise accuracy here. `codeatlas-intel` is the one arm that
actually *trims* tokens (+1.3M → +300K vs baseline) — the budgeted-context
trimming works. Full oc/mimo matrix (all 4 repos):

| repo      | arm        | acc | tokens  | Δ        | tools |
|-----------|------------|-----|---------|----------|-------|
| axios     | baseline   | 2.00| 578K    | —        | 52    |
| axios     | codeatlas  | 2.00| 1,848K  | +1,270K  | 140   |
| commander | baseline   | 1.78| 1,419K  | —        | 106   |
| commander | codeatlas  | 1.67| 2,303K  | +884K    | 130   |
| rxjs      | baseline   | 1.25| 1,342K  | —        | 89    |
| rxjs      | codeatlas  | 1.25| 2,036K  | +694K    | 116   |

**Verdict (oc/mimo):** codeatlas beats baseline on **0 repo(s)**, loses on 1
(commander), tie/insufficient on 3 — accuracy flat; token overhead comes from
MCP context injection (no win where mimo already solves the task at baseline).

## oc/nemotron (opencode/nemotron-3.5-lightning-free) — IN PROGRESS

winston suite (27 task-runs) launched. First task in flight at 165s+
(free-tier per-task cost is high), so full-suite ETA ≈ 1–1.5h.

### Live matrix (refreshed each check)

Current pace: `R1-T01-baseline` took **352s (~5.9 min)** — nemotron-lightning-free
is ~3× slower/task than mimo here (341K tokens, 23 tool calls). At this rate
27 runs ≈ **2.6 hrs** → finishing ~16:00, **not tonight**.

| repo    | mode run last | acc | tokens | Δ | tools | dur (s) |
|---------|---------------|-----|--------|---|-------|---------|
| winston | baseline R1-T01 (DONE) | — | 341K | — | 23 | 352 |

Suite status: bench CLI alive (pid 455878), driving task 2 of 27. Remaining
task-runs scaffold lazily; this table is appended as results land.

**Verdict (oc/nemotron):** pending — running at ~5.9 min/task. See options below.

---

## Decision log
- 13:08 — launched `oc-nemotron-winston`, `--mode both` (baseline+codeatlas).
- 13:13 — first task (R1-T01 baseline) complete: 352s, 341K toks, 23 tools.
- 13:14 — pacing revised: full suite ETA ≈ 2.6 hrs (ends ~16:00), not within
  the 21–23 window.


