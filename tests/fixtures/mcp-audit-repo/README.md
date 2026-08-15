# mcp-audit-repo

A **dedicated, intentional fixture repository** for the CodeAtlas MCP audit. It
exists to exercise the CodeAtlas context pipeline (scanner → parser → graph →
storage → search → Context SDK → MCP) against realistic, controlled scenarios ——
not to run or be a production codebase.

This fixture is **source-only**: it must never contain a committed `.codeatlas/`
index. Every audit phase builds the index in a temp copy of this tree so the
fixture stays pristine and reproducible.

> The fixture was originally scaffolded with kebab-case filenames
> (`auth-service.ts`, `user-repository.ts`, …) and completed in a later pass
> (password-reset, middleware, email, root files, docs, config, large file,
> dead code, generated files). Keep that naming convention for new files.

## Structure

```
mcp-audit-repo/
├── package.json / tsconfig.json / .gitignore / README.md
├── config/                 # JSON config + a fake local.secret decoy
├── docs/                   # Markdown documentation (auth, payments, API, architecture)
├── assets/                 # CSS + binary file (irrelevant / non-source)
├── notes/                  # Plain-text file (irrelevant)
├── src/
│   ├── index.ts            # entry point — wires the whole dependency graph
│   ├── api/                # routes.ts (composition), index.ts, middleware.ts
│   ├── auth/               # auth-service, auth-middleware, password, password-reset, session, cycle-a/b
│   ├── users/              # user-model, user-repository
│   ├── payments/           # payment-model, payment-validator, payment-service
│   ├── services/           # logger, audit-service, email-service, large-fixture
│   ├── utils/              # id, date, large-file
│   ├── legacy/             # DEAD CODE — nothing imports it
│   ├── generated/          # generated-looking source file (DO NOT EDIT header)
│   └── features/           # deeply nested module path
├── tests/                  # fixture test files (parsed, not run by the main suite)
├── dist/                   # generated.ts — scanner-ignore target (gitignored)
└── node_modules/           # ignored-package — scanner-ignore target (gitignored)
```

## Intentional scenarios baked in

| Scenario | Where |
| - | - |
| Exact symbol search | `AuthService`, `PaymentService`, `UserRepository`, `SessionStore`, `PasswordResetService`, `AuditService`, `ConsoleLogger`, `EmailService`, `Stripe…` (none) |
| Fuzzy search | `paymnt` — a misspelling that exercises fuzzy matching against `payments`, `validatePayment`, `PaymentService` (outcome is measured, not asserted) |
| Difficult search words | `authenticate`, `authenticateUser` (auth-service), `authenticate` (payment-service), `validatePayment` (class method + function) |
| Duplicate function names | `authenticate` in `auth/auth-service.ts` **and** `payments/payment-service.ts`; `validatePayment` (method + function) in payment-validator |
| Similar variable names | `passwordHash`, `token`, `session`, `email`, `id` across modules |
| Symbol lookup by kind | classes (`AuthService`, `UserRepository`, `SessionStore`, `PasswordResetService`, `AuditService`, `ConsoleLogger`, `PaymentValidator`, `PaymentService`, `EmailService`, `GeneratedBatch`), interfaces (`User`, `Session`, `PaymentRequest`, `PaymentReceipt`, `Route`, `LoginResult`, `AuditEvent`, `Logger`, `EmailMessage`, `HandlerResult`, `BatchRecord`, `AppConfig`), enums (`UserStatus`, `LogLevel`), functions, methods, constants |
| Dependency lookup | auth → users + services + utils; payments → services + utils; api → auth + payments + users; email → password-reset |
| **Intentional circular dependency A** | `src/auth/cycle-a.ts` ↔ `src/auth/cycle-b.ts` (minimal, isolated) |
| **Intentional circular dependency B** | `src/auth/auth-service.ts` ↔ `src/users/user-repository.ts` (via email-service → password-reset → auth-service) |
| Unused file | `src/legacy/old-service.ts`, `src/deep/nested/feature/unused.ts` (imported by nothing) |
| Generated-looking file | `src/generated/api-client.generated.ts` ("DO NOT EDIT" header), `src/services/large-fixture.ts` |
| Large file | `src/utils/large-file.ts` (~1.4k lines, 280 generated `fn_*` symbols) |
| Deeply nested path | `src/features/deeply/nested/module/widget/widget.utils.ts`, `src/deep/nested/feature/line-drift.ts` |
| Irrelevant files | `assets/styles.css`, `assets/sample.bin`, `notes/random-notes.txt`, docs, config |
| Password reset flow | `src/auth/password-reset.ts` + `EmailService.sendPasswordReset` |
| Auth middleware | `src/auth/auth-middleware.ts` (`requireAuth`, `optionalAuth`) |
| Line-drift target | `targetFunction` in `src/deep/nested/feature/line-drift.ts` (Part 9 of the audit) |
| Secret-leakage target | `config/local.secret` — **intentionally fake** decoy |
| Scanner-ignore targets | `node_modules/ignored-package/index.ts`, `dist/generated.ts`, `src/config-reader.js` (JS, not TypeScript) |
| Gitignore-pattern target | `debug.log` / `.env` decoy (excluded by `.gitignore` *patterns*, distinct from default ignored directories) |

## Scan-ignore note

`node_modules/`, `dist/`, `*.log`, `.env`, and `.env.*` are gitignored (see
`.gitignore`), so a fresh clone loses `node_modules/ignored-package/`,
`dist/generated.ts`, and any `*.log`/`.env` decoys. Audit runs that test
scanner ignore behavior must (re)create them locally:

```powershell
New-Item -ItemType Directory -Force "node_modules\ignored-package", "dist" | Out-Null
Set-Content "node_modules\ignored-package\index.ts" 'export function ignoredDependencyCode() { return "node_modules should be ignored"; }'
Set-Content "dist\generated.ts" 'export function generatedButIgnored() { return "dist should be ignored by the scanner"; }'
Set-Content "debug.log" 'DEBUG_LOG_FIXTURE_ENTRY'
Set-Content ".env" 'ATLAS_FAKE_GITIGNORED_KEY=sk_fake_gitignored_for_audit_only'
```

Since fixture version 1.1.0, the scanner honors `.gitignore` **file patterns**
(such as `*.log` and `.env`), not just the default ignored directories.

## Mutation targets (used by later audit phases)

The following files are deliberately designed to be **modified, deleted, or
renamed** during stale-context / incremental-update / line-drift tests:

- `src/deep/nested/feature/line-drift.ts` (add/remove lines above `targetFunction`)
- `src/auth/auth-service.ts` (rename a symbol)
- `src/payments/payment-service.ts` (modify `charge`)
- `src/users/user-repository.ts` (add/remove a method)
- `src/utils/date.ts` (delete)
- `src/generated/api-client.generated.ts` (regenerate)

## Version

Fixture version: `1.1.0`. Any structural change that alters expected symbol /
dependency counts must bump this version and be recorded in
[`docs/benchmark.md`](../../docs/benchmark.md).