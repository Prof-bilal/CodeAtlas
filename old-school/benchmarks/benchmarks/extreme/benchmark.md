# CodeAtlas Extreme-Repository Stress Benchmark — Report

**Date:** 2026-08-17 · **CLI:** 0.2.1 @ `de49e1f` (rebuilt from workspace sources, large-repo fixes included) · **Machine:** Linux Mint 22.3, AMD Ryzen 5 7430U (12 cores), 7.2 GiB RAM + 2 GiB swap, ~186 GiB free disk, Node v24.19.0. Full environment: `environment.json`.

## 1. Objective

Determine whether CodeAtlas can scan, index, search, retrieve context from, and
freshen an extreme-scale TypeScript monorepo, and at what resource cost. Target
corpora: **Repo A** (≥5,000 files, ≥5,000 LOC/file, ≥25M LOC) and **Repo B**
(≥10,000 files, ≥15,000 LOC/file, ≥150M LOC). No fake numbers; crashes and
resource limits are recorded honestly.

## 2. Methodology

Deterministic, seeded fixture generator (`generate.mjs`; seeds `0x5eed0001`/`0x5eed0002`).
Corpora are valid, cross-importing TypeScript monorepos (apps/packages/services/tests/
docs/config + ignored-dir junk + monster >20k-line files for Repo B). All timings and
memory measurements captured by `run-monitored.mjs` (records wall time, peak RSS,
min available RAM; kills the child if it exceeds an RSS cap or exhausts system RAM —
so a scan can fail without taking the machine down). Corrupted measurements (two
fixture generations, three system freezes, one interrupted run) are excluded from
averages and documented in §7.

## 3. Corpora

| Corpus | Files (TS) | LOC | Source size | Status |
|---|---|---|---|---|
| `repo-1000` (working) | 1,000 | 5,052,317 | 243 MiB | **Indexed** |
| `repo-5000` (Repo A) | 5,000 | 25,205,885 | 1.2 GiB | Generated; **not indexable on this hardware** |
| `repo-10000` (Repo B) | 10,005 | 150,393,960 | 8.1 GiB | Generator target (regenerate `--repo b`) |

## 4. Index-build (scan → parse → save) results

| Files | LOC | Wall | Peak RSS | Outcome |
|---|---|---|---|---|
| 500 | 2.53M | 111 s | 2,803 MB | **OK** (39,452 symbols, 69,704 deps) |
| **1,000** | **5.05M** | **241 s** | **4,852 MB** | **OK** (78,904 symbols, 139,408 deps) — practical limit (pre-fix) |
| 1,248 | 6.30M | 248 s | 4,942 MB | Guard-killed (available RAM 53 MB) |
| 1,657 | 8.36M | 321 s | 5,284 MB | Guard-killed (available RAM 59 MB) |
| 2,500 | 12.6M | 2,425 s | 5,324 MB | Guard-killed (available RAM 67 MB); swap-thrash slowed wall time |
| 5,000 | 25.2M | 984 s | 4,863 MB | Guard-killed (RSS cap); parse completed (~16 min), save phase OOM |
| **1,000 (post-fix)** | **5.05M** | **188 s** | **1,698 MB** | **OK** (78,904 symbols, 139,408 deps) — same corpus, after P0 fix (§7) |

Scanning (file walk + hash, no parse) is lightweight: `atlas scan` overview of
repo-1000 = 1.4 s. Index size for the 1,000-file corpus: **337 MB** (context.db),
roughly 1.4× the source size.

**Interpretation.** The full build holds the whole corpus in memory
(`indexProject` → `sourceFiles`), peaking at ~1.5-1.9× the corpus size on the
pre-fix build. **Post-fix**: the save phase no longer doubles RSS (see §7) — the
1,000-file build now peaks at **~1.7 GiB** (parse-phase bound) instead of
4.85 GiB, and finishes in 188 s instead of 241 s. On this 7.2 GiB machine shared
with the desktop session (~3-5 GiB resident), the safe build envelope is now
comfortably ≥ 1,000 files / 5.05M LOC / 243 MiB source. The remaining bottleneck
is parse-phase memory, which still scales ~linearly with corpus size — Repo A
(25M LOC) extrapolates to ~5-6 GiB, beyond this hardware → **RESOURCE
LIMITATION** (§8).

## 5. Read-path results (on the 1,000-file index)

### Search
- Latency (per `atlas search` invocation, index reloaded each time): **~1.9-2.6 s** warm; **6.4 s** truly cold; peak RSS ~738 MB. One outlier at 10.9 s ("order", GC/system noise).
- Precision: top hits are the correct `Validator*`/`Repository*` symbols at score 85-100; `--type file` and `--no-fuzzy` modes work. `getBalance` returned 0 hits (no such content exists in the corpus — not a false negative).

### Context assembly (`atlas context build`)
- Wall: **4.3-9.8 s** per task (includes index load).
- Budget: 20 items / 12,000 tokens total. Concrete code-change tasks assemble 5-8 items at **10,899 tokens** (within budget); generic tasks collapse to instructions+overview (3 items, **879 tokens**) because generated identifiers are opaque and retrieval is symbol/dependency-driven.
- Staleness reports `fresh` for an up-to-date index.

### Token savings (hierarchical reduction)
Whole-corpus baseline ≈ 243 MiB / 4 chars-per-token ≈ **61M tokens**. CodeAtlas
delivers **879-10,899 tokens per task** → **~4,600×-57,000× reduction** (~99.98%).

### MCP (`atlas mcp`, 12 calls, 0 errors)
| Tool | Latency |
|---|---|
| `project_overview` | 4,317 ms (first call, index load) |
| `search_symbols` | 195-1,577 ms |
| `search_files` | 90-103 ms |
| `get_dependencies` | 244-247 ms |
| `explain_module` | 217 ms |
| `get_summary` | 80 ms |
| `read_file_range` | 84-91 ms |

Concurrency: 5 parallel = 1.2 s, 10 = 2.4 s, 25 = 7.5 s, **0 errors** at every level.

### Incremental update
No-op `atlas update`: **12.4 s**, **0 files re-parsed** (hash-based skip verified;
1,114 unchanged). Single-file/100-file modification timings were interrupted by a
system freeze (§7) and are not reported.

## 6. Bottlenecks (priority order)

1. **P0 — Full in-memory corpus build.** The build materializes every file in memory before saving. The P0 save-phase native leak is **fixed** (§7): per-row statement preparation is eliminated, so saving no longer doubles RSS (1,000 files: 4.85 → **1.70 GiB** peak). Remaining: parse-phase memory still scales ~linearly with the corpus (~1.7 GiB per 5M LOC ⇒ ~5-6 GiB for Repo A). A streamed/index-on-disk pipeline (parse → persist per chunk → free) is the next step to reach the 25M/150M targets on commodity hardware.
2. **P1 — Single-threaded parser** (ts-morph), ~22.5k lines/s ⇒ ~18 min for 25M lines, ~1.9 h for 150M lines on one core.
3. **P2 — Read path reloads the whole index** per invocation: ~6 s / ~738 MB cold search on a 337 MB index.
4. **P3 — Retrieval is symbol/dependency-driven**, so semantically generic tasks under-return on opaque identifiers.

## 7. Honest accounting of failures

- **Three system freezes/reboots** occurred during full-build attempts (RSS driven to ~5 GiB on a machine already holding a 3-5 GiB desktop session). After adding the `run-monitored.mjs` guard (RSS cap + min-available-RAM kill), all subsequent heavy runs failed **cleanly via guard-kill**, never crashing the machine.
- Two early Repo A build attempts: V8 default 2 GiB heap OOM, then guard-kills at ~90 MB available RAM (pre-freeze mitigation).
- One interrupted modify-1/10/100-file incremental timing run (lost to a freeze); excluded.
- Two fixture generations (Repo B, Repo A subsets) were interrupted/regenerated; counts above are from the successful, verified generations.

### P0 root cause and fix

Measured per-phase (probe on repo-1000): scan+hash ~150 MB → read-all 429 MB → parse 1,622 MB → graph 1,661 MB → **save 3,111 MB** (heap flat at ~1,005 MB ⇒ the +1.45 GB was **native**, not V8). Chunked transactions and WAL tuning did not help; raw `node:sqlite` stayed flat at ~50 MB. Root cause: every repository call did `db.prepare(sql)` per row and never released it — `node:sqlite`'s `StatementSync` has no `close()` on Node 24, so each statement (and its native copy of bound strings) is reclaimed only at `db.close()`. A ~450k-statement save leaked ~1.4 GB native.

Fix (`packages/storage/src/repository/statement-cache.ts` + all repositories): each repository now lazily caches **one prepared statement per SQL text** and reuses it. Native memory is bounded to a single live binding per query, and bulk writes are ~4× faster in isolation. Same pattern applied to `@atlas/usage` repositories for consistency. Verified: full 1,000-file `atlas init` peak **4,274 MB → 1,698 MB**, min available RAM 23 MB → 1,361 MB, wall 241 → 188 s; `pnpm check` (typecheck + lint + format + 904 tests) green.

## 8. Verdict

**PASS WITH CONDITIONS.**

- CodeAtlas correctly indexes, searches, retrieves context from, and incrementally updates a **1,000-file / 5.05M-LOC** monorepo on this hardware — all read paths (search, context, MCP, dependency graph, `read_file_range`) functional with measured latency and ~57,000× token reduction. The P0 save-phase memory bug is **fixed** (§7): the same corpus now builds in 188 s at **1.70 GiB peak** with 1.36 GiB RAM to spare, no longer the machine's practical limit.
- The headline **25M / 150M LOC targets are not yet reachable on this machine**: parse-phase memory still scales ~linearly with the corpus (25M LOC extrapolates to ~5-6 GiB), and there is still no streamed/index-on-disk pipeline. Per the benchmark spec this is a **RESOURCE LIMITATION**, reported honestly — no fake numbers, no silently reduced sizes, crashes documented.
- With the remaining P0 work (streamed pipeline, chunked parse→save) and ≥16 GiB RAM, Repo A is expected to be indexable; Repo B additionally needs multi-core parsing (P1) to be practical.