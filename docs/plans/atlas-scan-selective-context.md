# Plan — Atlas Deep Scan → Selective AI Context Delivery

> **Status: [PLANNED] — design document, no implementation yet.**
> Requested 2026-08-23. Owner: CodeAtlas maintainers.
> Related: ADR-001 (deterministic context), ADR-005 (Context SDK), ADR-008
> (context-integration), ADR-013 (Benchmark API), `docs/benchmark.md`.

---

## 1. Goal (product story)

**Scan once, deeply. Then never hand an AI the whole repository again.**

Today the pipeline already scans, parses, indexes, and can answer queries — but
the product surfaces are fragmented (CLI context build, MCP tools, browser
benchmark). This plan productizes one coherent feature:

1. **`atlas scan` runs first and deep** — one command builds the full map of
   the repository (files, languages, symbols, dependencies, summaries,
   freshness).
2. **AI reads only what it asked for** — when a task/question arrives, Atlas
   assembles a **Context Slice**: the smallest relevant, ranked, budgeted set
   of files/symbols/dependencies — never the full scan output.
3. **The slice is usable by other AI agents** — Claude Code, Codex, Gemini
   CLI, OpenCode, or any consumer: live via the MCP tools, one-shot via an
   exported context file (`atlas context export --for claude`), or embedded as
   an instructions block in `CLAUDE.md`-style files.

### Why now

The agent-loop benchmark (ADR-012/013) shows CodeAtlas mode *costs more
tokens* when an agent already has grep/glob — the proven saving is
**whole-repo context vs. an Atlas slice** (~98% on winston, measured by the
browser quick test). Selective delivery is the feature that makes the
token-saving story real, measurable, and portable to every agent.

---

## 2. Definitions

| Term | Meaning |
|---|---|
| **Deep scan** | `atlas init`/`build`/`update` pipeline: scanner → hashing → parser → graph → storage, plus manifest and freshness tracking. "Deep" = symbols + dependency graph + summaries, not just a file list. |
| **Context Slice** | The ranked, budgeted, deny-filtered set of context items assembled for ONE task/query (a persisted, serializable projection of the existing `ContextPackage`, ADR-008). |
| **Selective delivery** | Serving the slice (not the repository) through a channel: CLI stdout, MCP tool, exported file, HTTP API. |
| **Agent handoff** | Making the slice consumable by an external AI agent: MCP registration (live), context-file export (one-shot), or instruction-block injection (passive). |

---

## 3. Current state inventory (verified — do not rebuild these)

| Capability | Status | Where |
|---|---|---|
| Deep scan + index (`indexProject`) | **[IMPLEMENTED]** | `packages/sdk/src/indexing/indexer.ts` |
| Scanner (walk/ignore/languages/framework) | **[IMPLEMENTED]** | `packages/scanner` |
| Parser → symbols | **[IMPLEMENTED, TypeScript only]** | `packages/parser` (known gap: non-TS languages are metadata-only) |
| Dependency graph | **[IMPLEMENTED]** | `packages/graph` |
| Deterministic retrieval (`getRelevantContext`) | **[IMPLEMENTED]** | `packages/sdk/src/context/sdk.ts` |
| Budgeted, deny-filtered package assembly | **[IMPLEMENTED]** | `packages/sdk/src/context-integration/` (ADR-008) |
| MCP server, 7 selective tools | **[IMPLEMENTED]** | `packages/mcp` (`search_symbols`, `read_file_range`, …) |
| MCP registration for agents | **[IMPLEMENTED]** | `atlas agents connect` (claude/gemini/codencode/opencode) |
| Session delivery (`launch`/`attach`) | **[IMPLEMENTED]** | `createContextIntegration()` |
| Browser quick test (slice measured live) | **[IMPLEMENTED]** | `apps/server` browser benchmark (ADR-013) |
| **Context Slice persistence / `atlas ask` / `context export --for <agent>`** | **[PLANNED — this plan]** | new |
| Multi-language deep parsing | **[PLANNED — separate roadmap]** | parser registry exists as the seam |

---

## 4. Architecture & data flow

```
        ┌─────────────┐  once / incremental
repo ──▶│  DEEP SCAN  │──▶ .codeatlas/ (manifest, context.db, hashes)
        └─────────────┘
               │
        ┌──────▼──────┐   task / question ("which ai data you want")
        │ SLICE ENGINE │──▶ ContextSlice {items[], budget, exclusions,
        └──────┬──────┘        staleness, provenance, tokens}
               │  (never the full scan output)
   ┌───────────┼───────────────┬───────────────┬──────────────┐
   ▼           ▼               ▼               ▼              ▼
 CLI        MCP tools      FILE EXPORT     HTTP API        SESSION
atlas ask   (live, any     .atlas/context/ /api/context    launch/attach
            MCP client:    <task>.md       (apps/server    (existing
            Claude Code,   + instruction    + UI slice     SessionPort)
            Codex, …)      block writer    workspace)
```

Key invariant (security + tokens): **every channel serves the slice**; no
channel streams the whole repository; every item carries `score`, `reason`,
and token estimate (provenance, already in `ContextPackageItem`).

---

## 5. Design — the Context Slice model

New serializable projection in `packages/sdk/src/context-integration/`
(extends, does not replace, `ContextPackage`):

```ts
interface ContextSlice {
  readonly id: string;                 // stable hash of {repo, task, budget}
  readonly task: string;
  readonly createdAt: string;
  readonly repository: { name: string; commit?: string; lastIndexedAt: string };
  readonly items: readonly ContextPackageItem[];   // reuse ADR-008 items
  readonly tokens: { estimated: number; method: "estimated" };
  readonly budget: BudgetRecord;                   // what was capped/dropped
  readonly exclusions: ExclusionRecord;            // deny-filtered paths
  readonly staleness: StaleContextSignal;
  readonly retrieval: { latencyMs: number; strategy: "deterministic-v1" };
}
```

Slice policies (constructor options, defaults conservative):
- `budget`: reuse `DEFAULT_CONTEXT_BUDGET` (20 items / 12K tokens) — callers
  may raise it explicitly, never silently.
- `formats`: `markdown` (agent-readable bundle), `json` (machine), later
  `diff`-friendly.
- **Freshness gate**: if `staleness.state === "stale"`, every channel must say
  so on the output (never serve stale context silently).

---

## 6. Delivery channels (the feature surface)

### 6.1 CLI — `atlas ask` (primary UX)

```
atlas ask "where is authentication implemented?" [--repo <path>]
          [--max-tokens 12000] [--save [path]] [--json]
```

- Runs the slice engine; prints only the slice: ranked files/symbols/deps
  with reasons, token count, staleness note.
- `--save` persists `.codeatlas/slices/<hash>.md` + `.json` (the "make a
  file" ask: the output IS a file, reusable anywhere).
- Auto-refreshes the index if stale (same freshness contract as MCP tools).

### 6.2 MCP (live selective delivery — Claude Code etc.)

- Existing 7 tools already deliver selective reads; add **`get_context_slice`**
  (task → slice bundle in one call) so MCP clients don't need to emulate the
  retrieval loop tool-by-tool.
- `atlas agents connect` already registers the MCP server for
  Claude/Gemini/Codex/OpenCode — document the Claude Code flow end-to-end
  (`claude mcp add codeatlas -- atlas mcp`).

### 6.3 File export for agents — `atlas context export`

```
atlas context export "explain the scheduler" --for claude [--out FILE]
                    --for generic   # agent-agnostic markdown bundle
```

- Writes a **self-contained markdown context file**: header (repo, index age,
  token estimate, "generated by CodeAtlas — do not edit"), ranked items with
  reasons, then fenced file contents (deny-filtered, truncated per budget).
- `--for claude`: optionally appends an instruction block to `CLAUDE.md`
  (idempotent, marked section, `--no-inject` to disable) that tells the agent
  what the file is and to re-run `atlas ask` for fresh slices.
- Target registry mirrors the Configurator adapters (claude/gemini/codencode/
  opencode/generic) — reuse `ConfiguratorPort` patterns (backup/rollback).

### 6.4 HTTP API + UI (apps/server)

- `POST /api/context/slices` {repositoryId|path, task} → job → slice result
  (same shape as the browser quick test, which becomes a thin consumer of the
  slice engine).
- UI: the Browser Benchmark workspace gains a **"Save slice"** action
  (downloads the markdown file) — one click from question to agent-ready file.

---

## 7. Deep-scan workstreams (making "scan deep" true)

1. **Honest language tiers** (docs + UI labels):
   - Tier 1 (symbols + graph): TypeScript/JavaScript — today.
   - Tier 2 (files/languages/deps metadata): everything the scanner detects —
     today.
   - Tier 3 (parsers for Go/Python/Rust/Java): later via the existing
     `ParserRegistry` seam; out of scope for this plan but designed for.
2. **Incremental + freshness**: hashing/snapshot already incremental; slices
   must carry the staleness signal end-to-end (design above).
3. **Scan depth report**: `atlas scan --json` already prints an overview;
   add depth fields (parsed vs metadata-only counts) so "deep" is measurable,
   not a claim.

---

## 8. Phased roadmap

### Phase 0 — alignment (½ day)
- Review this plan; pick slice defaults (budget caps, file naming).
- Decide `--for <agent>` target list (proposal: claude, gemini, codencode,
  opencode, generic).

### Phase 1 — slice engine core (1–2 days)
- `ContextSlice` model + `buildContextSlice()` in `@atlas/sdk`
  context-integration (wraps `assembleContextPackage`, adds id/latency/repo
  provenance).
- Markdown renderer (`renderContextSlice()`, reuses `renderContextPackage`
  conventions) + JSON.
- Persistence: `.codeatlas/slices/<hash>.{md,json}` (validated on read,
  size-bounded, untrusted-input safe — mirror Tool Manifest rules).
- Tests: budget enforcement, deny-filter, staleness labeling, renderer
  snapshot, persistence round-trip. No network, no AI.

### Phase 2 — CLI surface (1 day)
- `atlas ask` command (apps/cli; routes through SDK only).
- `atlas context export ... --for <agent>` (+ optional CLAUDE.md injection,
  idempotent, with backup — reuse Configurator backup/rollback).
- `--json` everywhere; friendly errors when no index (offer `atlas init`).
- Tests: CLI end-to-end on fixture repo (existing patterns in
  `apps/cli/tests`), injection idempotency, no-secret leakage.

### Phase 3 — MCP slice tool + agent onboarding (1 day)
- `get_context_slice` tool in `@atlas/mcp` (zod schema, outputSchema, same
  handlers style; serves the SAME slice engine — no second implementation).
- Docs: "Use Atlas context in Claude Code / Codex / Gemini CLI" runbook
  (`docs/AGENTS.md` or new `docs/AGENT_HANDOFF.md`), verified commands.
- Tests: tool bridge unit tests (existing `tool-bridge.test.ts` patterns).

### Phase 4 — HTTP API + UI (1 day)
- `POST /api/context/slices` in apps/server (job-based, reuses browser
  benchmark stages); Browser workspace "Save slice" download.
- Optional: show recent slices in the dashboard (list from
  `.codeatlas/slices/`).
- Tests: server route test with fixture repo (offline).

### Phase 5 — measurement & docs (½ day)
- Scan-based **Context Benchmark** (from the benchmark-pivot discussion):
  per task-file task, build a slice; measure tokens saved vs raw repo +
  retrieval precision (expected_files hit) — no AI needed. Feeds the
  dashboard's token-saving headline honestly.
- Docs updates: FEATURE_STATUS, CURRENT_STATE, CONTEXT_SDK.md, benchmark.md,
  README quickstart (`atlas init && atlas ask "…"` story).

**Total estimate: ~4–6 focused days.** Phases 1–2 deliver the user-visible
core (scan → ask → file for Claude Code).

---

## 9. Security & privacy requirements (hard rules)

- Deny-filter (`denyFilter`) runs in the slice engine — `.env*`, keys,
  credentials never enter any slice or export (already implemented for
  packages; slices inherit it — tested).
- Exports are plain files on the user's disk; `--for <agent>` injection only
  touches marked, backed-up sections; never auto-commits.
- MCP slice tool respects the same tool-call policy surface as the tool loop
  (ADR-011).
- No channel returns file contents beyond budget caps; paths in API
  responses stay repository-relative (ADR-013 rule).
- Stale index ⇒ labeled output, never silently outdated context.

## 10. Performance requirements

- Slice assembly ≤ 200ms on a 5K-file indexed repo (search is in-process;
  measured ~10ms retrieval on winston-class repos in the quick test).
- Export files bounded by the budget (default ≤ 12K tokens ≈ 48KB text).
- HTTP/UI: slices only, never repo contents beyond the budget (§17 ADR-013).

## 11. Non-goals (this plan)

- New language parsers (Tier 3) — separate roadmap.
- Vector/embedding retrieval — plugs into `RelevanceScorer` later.
- Autonomous agent behavior or prompt routing (Direction B router stays
  planned).
- Replacing the MCP tool loop for OpenCode/Ollama sessions — slices
  complement it.

## 12. Risks & open questions

| Risk | Mitigation |
|---|---|
| Slice quality varies by query phrasing | Deterministic v1 strategy + measured precision in Phase 5; strategy field allows v2 (vector) without contract change |
| CLAUDE.md injection fights user edits | Marked idempotent section + backup/rollback (Configurator pattern); `--no-inject` default-on debate — decide in Phase 0 |
| Token estimates (chars/4) overstate savings | Always labeled `estimated`; benchmark reports the method string |
| Scope creep into agent orchestration | Non-goals §11; slice ≠ router |

---

## 13. Acceptance criteria (feature complete when)

- [ ] `atlas init && atlas ask "<question>"` returns a ranked slice, not a
      repo dump, on a fresh clone of any Tier-1 repo.
- [ ] `atlas ask --save` / `atlas context export --for claude` produce an
      agent-ready file; Claude Code with the MCP registered can also fetch
      the same slice live via `get_context_slice`.
- [ ] No `.env*`/secret content can appear in any slice or export (test).
- [ ] Stale index is labeled on every channel (test).
- [ ] Phase 5 context benchmark shows measured token savings + precision in
      the dashboard with no fabricated numbers.
- [ ] Full `pnpm check` green; new tests per phase; docs updated.
