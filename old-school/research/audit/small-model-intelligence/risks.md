# Architectural and Operational Risks

| Risk | Where it arises | Mitigation |
|---|---|---|
| Infinite agent loops | verification↔fix, expansion, critic cycles | Hard bounds everywhere (table in proposed-architecture.md); every abort emits a report; global token/wall-clock budget |
| Excessive tool calls | weak model + many tools | Cap total tools ≤12; per-tool caps + `SearchMemory` (existing); high-level tools reduce calls |
| Context explosion | closure expansion, hierarchy | Tiered budgets (top-tier-first); expansion bounded N≤2; per-file range caps; quality ratio metric detects noise |
| Bad plans becoming authoritative | deterministic skeleton wrong (parser gaps: renamed imports, `export default`) | Model may *add* facts and flag conflicts; conflicts escalate to re-retrieval; plan versioned so changes are auditable |
| Critic hallucinations | model-based review | Deterministic checklist + verification output given to critic; critic advisory-only; deterministic findings mandatory |
| Validator false positives | flaky tests, env drift | Classify failures (pre-existing vs introduced by running checks before the change on untouched baseline); retry once; report unclassified as warning, never silent pass |
| Verification command abuse | running project commands | Allow-list per project, opt-in, argv-array spawn only, timeouts, user-visible (AGENTS.md §4.7) |
| Latency explosion | many rounds × local model | Parallel deterministic checks; per-round budget; small-model latency measured in benchmark; progress streaming already exists via sessions |
| Stale repository state | index drift during a session | Existing freshness machinery (`freshness.ts`, `expectedHash`, staleness auto-refresh in slices) — verification re-reads FS, never trusts index for final claims |
| Race conditions | concurrent index update + verification | Verification works on working tree, not index; index reads go through SDK lazy container (existing) |
| Cache invalidation | repo memory/plan caches | Content-hash keys (existing `summary.service.ts` pattern); invalidate on `updateContext` |
| MCP complexity | tool count/schema drift | Schema-versioned outputs (existing pattern), ≤12 tools, docs updated per change (docs/MCP.md) |
| Model-specific behavior | adapters differ (tool-calling support, JSON reliability) | Provider logic stays in adapters; capability flags on `ProviderPort`; degrade gracefully (no tool-calling → pre-delivered context only) |
| Debugging difficulty | intelligence layer obscures failures | Every loop decision logged with reason; verification report includes trace; `atlas doctor` extended to check verifier config |
| Memory corruption / state bloat | AgentState grows across rounds | State is bounded and compacted (facts merged, old tool payloads dropped, only summaries kept) |
| Over-engineering / rewrite temptation | this plan touches many seams | Evolution only: new ports + SDK composition; no rewrite of scanner/storage/search; ADR per architectural change; existing tests must keep passing (`pnpm check`) |
| Token cost blowup (philosophy risk) | quality-first budget | Budgets still exist; benchmark reports cost/quality curves so the tradeoff is explicit |
