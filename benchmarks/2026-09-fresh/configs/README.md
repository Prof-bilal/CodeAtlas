# Benchmark Configuration Matrix — 2026-09 Fresh

Four configurations, differing **only** in harness composition. Model, task, task
prompt, repository + commit, machine/environment, timeout, and evaluator are
identical across configs (Phase 4 / Phase 15 anti-gaming rule).

| Config | CodeAtlas | External tools | Skills | Purpose |
|---|---|---|---|---|
| **A — Baseline** | off | off | off | Agent without CodeAtlas (true baseline; comparison floor) |
| **B — CodeAtlas Simple** | on | off | off | Direct value of CodeAtlas core context |
| **C — CodeAtlas + Tools** | on | on | off | Value of adding the 3 external tools over CodeAtlas alone |
| **D — CodeAtlas + Tools + Skills** | on | on | on | Value of the complete harness (adds relevant workflow skills) |

## How configs map to the harness

The existing CodeAtlas benchmark framework (`@atlas/benchmark`, `atlas benchmark`)
runs a task in a **mode**: `baseline` or `codeatlas`. The fresh benchmark layers
two orthogonal axes on top, driven by the `harness` block in each config:

- `codeatlas`: maps to `--mode codeatlas` (MCP enabled, `ATLAS_ROOT=<repo>`) vs
  `--mode baseline` (MCP disabled). **A** uses `baseline`; **B/C/D** use
  `codeatlas`.
- `tools`: when `true`, the three selected MCP servers (web-search, web-fetch,
  github — see `tools.json`) are enabled alongside CodeAtlas in the agent's MCP
  set. **A/B** run without them; **C/D** run with them.
- `skills`: when `true`, the applicable domain skill is resolved + loaded by the
  benchmark Skills loader and its rendered instructions are prepended to the
  task prompt (progressive disclosure: metadata first, full body only for the
  matched skill). **D** is the only config with skills.

## What is held constant

| Axis | Value |
|---|---|
| Model | Same `model` string in all 4 configs (edit `<set-me>` in each config) |
| Task prompt | Identical user-facing prompt per task (no solution leakage) |
| Repository + commit | Same pinned repo per task |
| Environment / hardware | Same runner machine for a given run cycle |
| Timeout | `taskTimeoutMs` identical (840 s in seed configs) |
| Evaluator / success criteria | Same evaluator (see `metrics/`) |
| Runs per config × task | `runsPerTask` identical (5 in seed configs) |

Only the harness composition changes between **A → B → C → D**.