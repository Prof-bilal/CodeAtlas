# CodeAtlas Usage & Credits

How CodeAtlas records, aggregates, budgets, and enforces **AI usage** (agent,
provider, model, task, session, tokens, requests, latency, cost), and how the
CLI exposes it. Complements [AI_PROVIDERS.md](./AI_PROVIDERS.md) (how calls are
made) and [CLI.md](./CLI.md) (the command surface). The implementation lives in
`@atlas/usage` behind the `UsagePort` contract in `@atlas/core`; consumers reach
it through `@atlas/sdk` (`createUsageService`).

> Everything here is **verified against the code**. The tri-state provenance
> model below is the core invariant — never drop it or replace it with a plain
> number.

---

## 1. Design principle: never guess

Every token, cost, latency, or price value carries a provenance label:

| Source       | Meaning                                                              | Value |
| ------------ | -------------------------------------------------------------------- | ----- |
| `actual`     | The provider/service reported the exact value                        | number |
| `estimated`  | Derived from a documented, labeled heuristic                         | number |
| `unknown`    | No data available                                                    | `null` |

`MeasuredQuantity { source, value, note? }` encodes this; **`value` is `null`
whenever `source` is `"unknown"`** — callers must not invent a number. When
`unknown` values are aggregated they stay `unknown` (an `unknown` input token
count cannot silently become a "real" total). Estimated values are always
labeled, e.g.:

- tokens estimated from prompt/response text: `"character→token estimate, not
  actual"` (`TOKEN_ESTIMATE_NOTE`);
- prices from the built-in table: `"published list price, not verified"`.

Cost is **computed at record time** from tokens + pricing (`computeCost`) — a
`CostRecord` is a snapshot, not a live calculation.

---

## 2. What gets recorded

`UsageEventInput` is one of two shapes:

- **`source: "provider"`** — a single provider model call: `provider`, `model`,
  `requestCount` (default `1`), `latencyMs`, exact `inputTokens`/`outputTokens`/
  `totalTokens`, optional estimated token fields, plus `agent` (defaults to
  provider), `sessionId`, `taskId`, and an **anonymized** `taskRef`.
- **`source: "session"`** — an agent session / AI CLI run (no token or model
  data): `provider`, `agent`, `requestCount` (required), optional `latencyMs`,
  `exitCode`, `timedOut`, plus the same identifiers.

Both feed `normalizeEvent` → `UsagePort.record`, which persists a normalized
`UsageRecord` (oldest → newest ordering via `listUsage`).

### Opt-in token estimation

Estimation is **never silent**: provider events may carry
`estimatedInputTokens`/`estimatedOutputTokens` (produced by `withUsageTracking`
only when the caller opts in via `{ estimateTokens: true }`). `estimateTokens`
(`@atlas/usage`) derives a rough count from `request.prompt` / `response.content`
(`Math.ceil(length / 4)`); such tokens carry `estimated` provenance and the
`TOKEN_ESTIMATE_NOTE` note. Providers that report real usage always win.

### Privacy

Records never contain prompts, API keys, or provider secrets; `taskRef` is a
hash, never raw task text. The usage database (`.codeatlas/usage.db`) is a
separate SQLite store from the context database (`@atlas/storage` owns the
context DB; `@atlas/usage` owns usage persistence).

---

## 3. Collection seams

Two ways usage enters the store:

- **`withUsageTracking`** (`@atlas/usage`, exported via `@atlas/sdk`) — a thin
  wrapper around a provider call (`UsagePort` function or `ProviderPort.complete`
  call). Records a `provider` event with actual tokens (when reported) and
  optional estimation; supports `recordOnError`, `defaultProvider`, and an
  injected `UsagePort` / `PricingSource`. The security rules: prompts and keys
  are never passed through to the record.
- **`trackAgentRun`** — records an agent session run as a `session` event (tokens
  unknown by design — CLI runs don't report token usage).
- **`atlas context launch`** — records a `session` event (provider, session id,
  `requestCount: 1`) in `.codeatlas/usage.db` so the launched session shows up in
  `atlas usage` and its token impact can be reported on stop. Best-effort: a
  usage-recording failure never fails the launch.

### Session token impact (`atlas sessions stop`)

Stopping a session prints a token-impact report:

- **Burned** — the tokens recorded against that session id
  (`UsageQuery.sessionId`), tri-state.
- **Without CodeAtlas** — an `estimated` baseline of what pasting the whole repo
  would cost: **indexed file bytes ÷ 4** (the documented character→token
  heuristic), read through the Context SDK (`createContextSDK.files`).
- **Saved** — `withoutCodeAtlas − burned`; `unknown` unless both sides are
  numeric (the tri-state model never invents a difference).

These are estimates for orientation, never provider-reported billing.

The `UsageService` (`record`) looks up pricing through the injected
`PricingSource` (never a hardcoded provider table in business logic) and
computes the `CostRecord`.

---

## 4. Aggregates, budgets, limits

### Aggregates

`UsagePort.statistics(query?)` rolls up events → `UsageStatistics`:
total `events` / `requests`, `tokens` (input/output/total with provenance),
`cost`, `latency` (samples / avg / max / p95), plus `byProvider` and `byDay`
(`YYYY-MM-DD`) breakdowns. `UsageQuery` filters by provider / agent /
sessionId / taskId / time range (`from`/`to`, inclusive ISO) / `limit`.

### Budgets (soft)

`setBudget({ scope, tokenLimit?, costLimit?, currency? })` creates or replaces a
soft target for a scope (`agent` | `provider` | `session` | `user`).
`budgetStatus(scope)` reports current consumption vs the limits (`tokenPercent` /
`costPercent`, 0–100 or `null`). **Budgets never block calls** — they are
visibility, surfaced by `atlas usage`.

### Limits (hard)

`setLimit({ scope, tokenLimit?, costLimit?, currency? })` sets a **hard cap**.
`checkLimit(scope, projection?)` decides whether a projected (about-to-run) call
fits; when it would exceed the limit it returns a **failed** `Result` (a typed
`UsageLimitExceededError`) so callers **deny by default** (fail safe). With no
configured limit the check always allows. An `unknown` projection is handled
conservatively by the caller (project with cap); reads of existing usage are
never blocked.

---

## 5. Pricing

`PricingSource` (`priceFor(provider, model)` + `listProviders()`) is the only
way the service learns prices. `StaticPricingSource` is the built-in
implementation — a static table covering claude / openai / deepseek / gemini,
**all marked `estimated`** ("published list price, not verified"); unknown
provider/model combinations fail cleanly (`UnknownPriceError`). A future live
or per-provider pricing adapter implements the same interface — no
`if (provider === …)` switches in business logic.

---

## 6. On-disk storage & the SDK surface

- **Store:** `UsageStore` (`@atlas/usage`) — SQLite via `node:sqlite`
  (needs Node `>=22.5.0`), schema + migrations in `@atlas/usage` (usage /
  budget / limit tables via row/repository helpers). Defaults to `:memory:`.
- **SDK:** `createUsageService({ filePath?, store?, pricing? })` (`@atlas/sdk` →
  `./usage/service.ts`) returns a fully-wired `UsagePort`. Consumers (CLI, MCP,
  agents) must use this — not the store or repositories directly.
- **Errors:** `UsageError`, `UnknownPriceError`, `UsageLimitExceededError`
  (carries the failing `LimitCheck`), all exported from `@atlas/usage` and
  re-exported by `@atlas/sdk`.
- **Independently usable helpers:** `aggregateUsage`, `sumCost`, `sumTokens`,
  `combineSources`, `computeCost`, `estimateTokens`, `normalizeEvent`,
  `StaticPricingSource` — exported from `@atlas/usage`. Note: `@atlas/sdk`
  re-exports only the subset above (it does **not** re-export `estimateTokens`;
  the SDK already exports a different `estimateTokens` from
  context-integration — ADR-008).

---

## 7. CLI (`atlas usage`)

See [CLI.md](./CLI.md) for the full command table. Summary:

| Command | Behavior |
| ------- | -------- |
| `atlas usage` (bare) | Same as `atlas usage summary` |
| `atlas usage summary` | Totals (events, requests, tokens, cost, avg latency) + budget status; `--json` → `{ statistics, budgets }` |
| `atlas usage list` | Table of recorded events (ID, agent, provider, model, tokens, cost, latency, when); `--json` → `{ records }`; `--provider <p>` filter |
| `atlas usage budgets` | Per-scope budget status lines; `--json` → `{ budgets }` |

`atlas usage` reads/writes `.codeatlas/usage.db` under the resolved project root
(`ATLAS_ROOT`/cwd) and renders the tri-state values honestly: `unknown` where
there is no data, `(estimated)` labels where a figure is an estimate. The parent
command deliberately declares **no** `--json` option — Commander would otherwise
consume the flag before subcommand dispatch (e.g. `atlas usage list --json`).

`atlas sessions stop` reads the same database to report a session's burned
tokens vs the whole-repo baseline (see §3). `atlas context launch` writes a
`session` event so launched sessions appear here and their impact can be
computed on stop.

---

## 8. Security notes

- Never log or print provider config / API keys (records don't hold them).
- Never send prompts out: usage records store metadata only; `taskRef` is hashed.
- `node:sqlite` engine requirement (`>=22.5.0`) — see [CONTEXT_STORAGE.md](./CONTEXT_STORAGE.md).
- Pricing values are labeled `estimated` and must never be presented as actual
  provider billing.

---

## 9. Testing

Unit + integration coverage in `packages/usage/tests/`: `collector.test.ts`,
`pricing.test.ts`, `usage.service.test.ts`, `usage-store.test.ts`,
`integration.test.ts` (+ `helpers.ts`). Tests use mocked provider calls /
injected stores and require **no** provider credentials or network. CLI
rendering is covered in `apps/cli/tests/cli.test.ts`. See
[TESTING.md](./TESTING.md).

> **Ground truth:** [CURRENT_STATE.md](./CURRENT_STATE.md) and
> [FEATURE_STATUS.md](./FEATURE_STATUS.md) reflect what is actually implemented;
> status tags for `@atlas/usage` live there. ADR-009 records the design
> decision behind this module.
