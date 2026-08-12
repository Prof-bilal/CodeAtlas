# CodeAtlas Privacy Policy

The privacy contract of the product, mirroring the "Local First" product
principle ([PRINCIPLES.md](./PRINCIPLES.md)).

---

## 1. Default behavior: everything stays local

```text
   Repository              CodeAtlas                .codeatlas/
        │                       │                       │
        ├── scan ──────────────▶│                       │
        ├── parse ─────────────▶│  (no network)  ─────▶│ manifest.json
        ├── hash ──────────────▶│                       │ context.db (library/SDK)
        └── graph / symbols ───▶│                       │ context.db / summaries
                               └───────────────────────┘
```

By default, **no part of the repository, its derived context, or its metadata
leaves the machine.** Scanning, parsing, hashing, graph building, storage, and
search are all offline operations.

---

## 2. When an AI provider is configured

If (and only if) the **user** configures an AI provider, the flow becomes:

```text
Relevant context
      ↓
User-selected provider
```

- **Send only the relevant context** — the specific file/symbol/summary that
  answers the request — **not the entire repository**.
- The **whole-repository upload** path is reserved for cases where the user
  explicitly enables and approves it (e.g. a project-level summary feature the
  user asks for). It must be explicit, default-off, and visible.

### What "relevant" means

- The analysis pipeline is *deterministic first*. Facts computed locally
  (symbols, graph queries, file contents) are local; AI sees a **narrow slice**
  chosen by the user's command.
- Summaries: per-file summaries built from a single `SourceFile` (content-hash
  cached), assembled into scope summaries locally — not a wholesale repo dump to
  a model.

---

## 3. Provider configuration & API keys

- Providers, keys, base URLs, and scopes are **user-controlled** config
  ([AI_PROVIDERS.md](./AI_PROVIDERS.md), [SECURITY.md](./SECURITY.md)).
- Keys live in user config/env; they are never read from the analyzed repo and
  never sent anywhere but the configured provider endpoint.
- No vendor traffic without a configured provider.

---

## 4. Telemetry

- **No implicit telemetry.** CodeAtlas does not phone home. If analytics are
  ever added, they must be opt-in, disabled by default, contain no source code
  or file names, and be documented here.

---

## 5. Third-party content (dependency supply-chain)

- CodeAtlas only installs the packages it declares (lockfile-pinned).
  Dependency choice must respect user privacy expectations: prefer libraries
  that are local and offline ([DEPENDENCIES.md](./DEPENDENCIES.md)).
  A developer tool silently phoning home would violate this policy — audit
  added dependencies for network behavior.

---

## 6. Privacy checklist

- [ ] No network calls from scanner/parser/hash/graph/storage/search.
- [ ] Provider calls only via configured provider adapters, sending narrow
      context.
- [ ] `.codeatlas/` stays on disk, local, gitignored.
- [ ] No telemetry, no phone-home, no implicit uploads.
- [ ] Keys & config in user control and redacted on display.
