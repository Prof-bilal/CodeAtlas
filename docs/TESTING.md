# CodeAtlas Testing Policy

The testing contract for the monorepo.

---

## 1. Baseline

- **Framework:** Vitest (run from the repo root via `pnpm test` /
  `pnpm test:watch`). `vitest.config.ts` defines aliases and the test glob
  (`packages/*/tests/**/*.test.ts`, `apps/**/tests/**/*.test.ts`).
- **Every meaningful module has tests.** No production module ships without a
  test file; new behavior must come with tests.
- Tests verify **behavior, not implementation details** — prefer exercising the
  public port/service API over asserting internal call sequences.

## 2. Test tiers

| Tier | Scope | Where |
| ---- | ----- | ----- |
| Unit | A single service/function in isolation | `packages/<pkg>/tests/*.test.ts` |
| Integration | Several modules composed (e.g. SDK container, parser→graph, storage round-trip) | same test files / `*.integration.test.ts` |
| CLI | Command list, arg parsing, help, end-to-end command behavior against a fixture repo | `apps/cli/tests` |
| Provider adapter | Each adapter parses requests & responses offline via an injected fake transport | `packages/providers/tests` |
| Parser | Symbol extraction/references per language plugin | `packages/parser/tests` |
| Scanner | Walk/ignore/language/framework/manifest | `packages/scanner/tests` |
| Hashing | Hash math, diff classification, snapshots | `packages/hashing/tests` |
| Database | `ContextStore` CRUD, migrations, transactions, search | `packages/storage/tests` |
| MCP | Tool registry, handler behavior vs. an in-memory `ContextStore`, and protocol behavior over `InMemoryTransport` + real `Client` | `packages/mcp/tests` |

## 3. Non-negotiable rules

- **Do not remove failing tests merely to make the suite pass.** A failing test
  is signal; fix the code, or — if the test is genuinely wrong — fix the test
  with a documented reason. Never delete coverage silently.
- **Never fabricate test results.** A test must actually exercise the code; no
  `it.skip` to hide brokenness without a tracked reason.
- **No network in the unit suite.** Provider transports are injected/faked;
  no live API calls.
- **Deterministic tests.** Avoid time-of-day dependence, absolute temp paths, and
  shared state. Use fixtures + `mock` where needed.
- **Test both success and failure** (`Result` `ok`/`fail` paths, error cases,
  edge inputs: empty dirs, missing files, unicode paths).
- **Dead/stubbed features are tested as stubs.** The `context` service's tests
  assert `ComingSoonError` — that is intentional and correct today.

## 3. Running

```bash
pnpm test           # full suite
pnpm test:watch     # watch mode
pnpm --filter @atlas/parser test   # single package
pnpm check          # typecheck + lint + format + test (the CI gate)
```

## 4. Coverage expectations

- No hard threshold is enforced by config, but **meaningful modules** reach it:
  every `src` file should have behavioral coverage. Use `coverage/` reports to
  spot modules that are effectively untested.

## 5. Adding a test

1. Put it next to the package in `packages/<pkg>/tests/<name>.test.ts`.
2. Reuse the existing test helpers (`tests/helpers.ts` in each package) rather
   than re-creating fixtures.
3. For integration, prefer assembling real services through the SDK `Container`
   over mocking ports.
4. Cover the **new behavior assertively**: the test would fail without your fix.