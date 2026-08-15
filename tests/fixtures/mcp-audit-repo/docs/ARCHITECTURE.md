# Fixture Architecture

A deliberately small three-tier TypeScript application used as a CodeAtlas
audit fixture.

```
            ┌──────────────────────────────┐
            │         src/index.ts          │  entry point
            └──────────────┬───────────────┘
                           │
            ┌──────────────▼───────────────┐
            │        src/api/               │  router + middleware + validators
            └──────────────┬───────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
 ┌───────────┐      ┌────────────┐      ┌─────────────┐
 │ src/auth/ │      │ src/users/ │      │ src/payments/│
 └─────┬─────┘      └─────┬──────┘      └──────┬──────┘
       │                  │                    │
       └──────────────────┼────────────────────┘
                          ▼
                  ┌─────────────┐     ┌──────────────────┐
                  │ src/services/│◄───►│    src/utils/     │
                  └─────────────┘     └──────────────────┘
```

## Modules

- **auth** — session management, token validation, password hashing, password
  reset. Depends on `users` (looks users up by email).
- **users** — user CRUD. Depends on `auth` (password hashing) and `utils`.
  > auth ↔ users form an **intentional circular dependency**.
- **payments** — payment processing through the Stripe adapter, invoices.
- **api** — HTTP composition root: wires auth middleware + user routes together.
- **services** — email, cache, audit.
- **utils** — config, logger, helpers.
  > config ↔ cache form a second **intentional circular dependency**.

## Deliberate anomalies

- `src/legacy/old-service.ts` is dead code (imported by nothing).
- `src/generated/api-client.generated.ts` looks machine-generated.
- `src/utils/large-file.ts` is intentionally large (~1.4k lines).