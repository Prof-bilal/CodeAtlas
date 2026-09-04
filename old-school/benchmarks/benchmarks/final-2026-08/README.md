# CodeAtlas Final Benchmark — 2026-08

End-to-end benchmark of **CodeAtlas** as an AI-context engine for **OpenCode**
agents. It measures whether CodeAtlas actually helps an agent answer real
coding/repository questions with less token usage, latency, and cost — using
**actual provider-reported token and cost numbers** for every run.

This is a from-scratch benchmark run (a previous benchmark lives in
`benchmarks/` and was left untouched).

## Results

| File | Purpose |
|---|---|
| `summary.md` | Cross-repository comparison, scaling analysis, final verdict |
| `failures.md` | Every failure recorded |
| `benchmark-config.json` | Agent, provider, model, pricing, and repository pins |
| `environment.json` | Machine / runtime snapshot |
| `tasks/repo-0X.json` | The exact task suites (identical prompts for both modes) |
| `repo-0X/benchmark.md` | Per-repository report |
| `repo-0X/raw-results.json` | Complete task-level measurements |
| `repo-0X/runs/*.json` | Full OpenCode event streams per run (raw evidence) |
| `repos/repo-0X/` | Pinned repository checkouts (gitignored) |

## Repositories

Real open-source repositories, pinned to commits:

| ID | Repository | Commit | Files |
|----|-----------|--------|------:|
| repo-01 | [winston](https://github.com/winstonjs/winston) | `ff0b79de8562bb322c390fbc82fe71c11f373428` | 116 |
| repo-02 | [commander.js](https://github.com/tj/commander.js) | `ba6d13ddb4243e5913367734f8c159089ffe7834` | 216 |
| repo-03 | [axios](https://github.com/axios/axios) | `84a9f3b9a4f3244b8c8e818f557d64c7b964fb25` | 466 |
| repo-04 | [rxjs](https://github.com/ReactiveX/rxjs) | `e5351d02e225e275ac0e497c7b66eaa5f0c88791` | 1288 |

## Environment

The benchmark runs on Linux with Node.js >= 22.5.0. See `environment.json`
for the exact snapshot of the machine it was executed on (CPU/RAM/kernel/
Node/OpenCode/CodeAtlas/Git/Go versions). Performance is hardware-dependent.

## Agent and Model

- Agent: **OpenCode** (`opencode run --format json`)
- Provider: **opencode** (the OpenCode Zen gateway — the only authenticated
  provider on the benchmark machine)
- Model: **opencode/deepseek-v4-flash-free** (free tier; OpenCode reports
  `cost: 0` on every step, so token savings — not cost — is the primary
  economic metric; see `benchmark-config.json`)

Both modes use the **same model, provider, temperature configuration, task
prompts, and repository commits**.

## Two Modes (identical prompts)

- **Baseline** — `opencode run` with the CodeAtlas MCP **disabled**. The agent
  has only OpenCode's built-in file/grep/glob tools.
- **CodeAtlas** — `opencode run` with the **CodeAtlas MCP server**
  (`codeatlas-mcp`) enabled through a per-repo `opencode.json` whose
  `ATLAS_ROOT` points at the indexed repository. The agent can call
  `codeatlas_*` tools: `search_symbols`, `search_files`, `get_summary`,
  `get_dependencies`, `explain_module`, `project_overview`, `read_file_range`.

The CodeAtlas Toolkit (`atlas tools overview/categories/search/info/doctor`,
`atlas agents status`) is measured as part of the benchmark, and CodeAtlas
deterministic context assembly is measured per task with
`atlas context build <task> --repo <repo> --json`.

## Reproduce

### Install dependencies

```bash
cd /home/abdullah/CodeAtlas
pnpm install
pnpm build   # builds apps/cli -> node_modules/.bin/atlas + codeatlas-mcp
```

### Prepare repositories

The checkouts live under `benchmarks/final-2026-08/repos/` (gitignored).
Reproduce them from any working machine:

```bash
cd benchmarks/final-2026-08/repos
git clone https://github.com/winstonjs/winston repo-01
git -C repo-01 checkout ff0b79de8562bb322c390fbc82fe71c11f373428
git clone https://github.com/tj/commander.js repo-02
git -C repo-02 checkout ba6d13ddb4243e5913367734f8c159089ffe7834
git clone https://github.com/axios/axios repo-03
git -C repo-03 checkout 84a9f3b9a4f3244b8c8e818f557d64c7b964fb25
git clone https://github.com/ReactiveX/rxjs repo-04
git -C repo-04 checkout e5351d02e225e275ac0e497c7b66eaa5f0c88791
```

### Configure OpenCode

Authenticate OpenCode with the provider that will be used, and set the model
in `benchmark-config.json` (default `opencode/deepseek-v4-flash-free`). The
runner passes `--model` explicitly to every run.

No CodeAtlas configuration is needed in the user's global OpenCode config: the
runner writes a per-repo `opencode.json` for the CodeAtlas mode and removes it
for the baseline mode.

### Run the benchmark

```bash
cd /home/abdullah/CodeAtlas/benchmarks/final-2026-08
node run-benchmark.mjs --env-only     # capture environment.json only
node run-benchmark.mjs                # index repos + run all 64 agent tasks
node run-benchmark.mjs --tasks-only   # reuse existing indexes, run tasks
node run-benchmark.mjs --skip-index   # reuse existing indexes and metrics
node run-benchmark.mjs --force        # rerun tasks that already have runs
```

### Generate reports

```bash
cd /home/abdullah/CodeAtlas/benchmarks/final-2026-08
node generate-reports.mjs             # repo-0X/benchmark.md + summary.md + failures.md
```

## Metrics (what is measured, and how)

- **Tokens**: summed from OpenCode `step_finish` events (`tokens.total`,
  `.input`, `.output`, `.reasoning`, `.cache.write`, `.cache.read`). These are
  **actual provider-reported numbers**, not estimates.
- **Cost**: summed from OpenCode's per-step `cost` field.
- **Latency**: wall-clock around each `opencode run`; indexing time from
  `atlas init`; deterministic context-assembly time from `atlas context build`;
  per-MCP-call latency from `tool_use` event timestamps; `codeatlas-mcp`
  startup from a JSON-RPC initialize probe.
- **Accuracy**: per task, scored 2 (correct) / 1 (partially correct) /
  0 (incorrect) / failed, based on how well the final answer covers the
  task's `expected_files` and `expected_concepts` and cites real files.
  Automated keyword scoring was computed by the runner; every score was
  **reviewed manually** against the saved final answers before the reports
  were finalized.

## Integrity rules applied

- No fabricated metrics; `N/A` is used wherever a metric was not available.
- No invented model names or pricing; cost comes from the provider-reported
  field, and pricing source is documented in `benchmark-config.json`.
- Identical prompts / model / provider / commit for baseline and CodeAtlas.
- No secrets: repository checkouts contain no credentials; `.env*`, tokens,
  and API keys are never written to this directory. The OpenCode auth key
  lives outside the repository (`~/.local/share/opencode/auth.json`).
- Single-run per task per mode, documented (64 agent runs total).
- Derived numbers (savings, percentages, accuracy) are clearly computed from
  the measured numbers in `raw-results.json`.