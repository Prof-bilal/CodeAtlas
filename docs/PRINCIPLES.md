# CodeAtlas Product Principles

Non-negotiable design principles. Every change must be consistent with these.

---

## Local First

Source code stays on the user's machine by default.

- CodeAtlas never uploads a repository to a remote service unless the user
  explicitly configures such behavior.
- No phone-home telemetry, no implicit cloud indexing, no third-party CDN reads
  of the user's code.
- "Local" includes the context database, the graph, symbols, hashes, and
  summaries: all are produced and stored on the user's machine.

## AI Optional

The core analysis pipeline must **not** depend on an AI provider.

- Scanner, parser, symbol extraction, hashing, dependency analysis, storage and
  search must remain useful with **no provider configured**.
- AI only *adds* semantic summaries and conversational explanations — it never
  gates the pipeline.
- The `context` stub (intentional, see [CURRENT_STATE.md](./CURRENT_STATE.md))
  reflects this: ranking/assembly is deferred until the deterministic core is
  solid, so that AI is an enhancement, not a dependency.

## Provider Agnostic

CodeAtlas is not coupled to one AI vendor.

- All model access goes through `ProviderPort` adapters (see
  [AI_PROVIDERS.md](./AI_PROVIDERS.md)).
- Planned/targeted providers: Claude, OpenAI, Gemini, DeepSeek, Ollama, and
  anything OpenAI-compatible.
- Provider-specific logic lives in adapters — never scattered through the app.

## CLI First

- The primary product is a CLI (`atlas`).
- No web UI unless explicitly requested.
- Terminal-first UX: `atlas init`, `atlas build`, `atlas search`, `atlas /claude`,
  etc.

## Open Source / MIT

- Transparent, portable implementations.
- Avoid proprietary or license-hostile dependency chains.
- New dependencies follow [DEPENDENCIES.md](./DEPENDENCIES.md).

## Deterministic Before AI

- If static analysis can determine a fact reliably, use it. Do not ask an LLM
  for something a parser can compute.
- E.g., "which classes extend `Service`?" is a graph query — never an AI prompt.
- AI is for *semantic* summaries and natural-language reasoning, not for
  mechanical facts.

## Incremental Processing

- Do not redo unchanged work. Hash files, compare snapshots, and reprocess only
  `changed` + `added` files (implemented in `@atlas/hashing`).
- Caching keyed by content hash keeps summaries and analyses cheap across runs.

## Modular Architecture

- One package = one responsibility. Interfaces in `core`, implementations in
  feature packages, composition in `sdk`.
- See [MODULES.md](./MODULES.md) and [DEPENDENCIES.md](./DEPENDENCIES.md).

## Orchestrate, Don't Reimplement

- CodeAtlas launches and manages existing AI coding CLIs (Claude, Gemini, Codex,
  OpenCode, DeepSeek, …) rather than reconstructing their internal agent
  behaviors.
- Reimplementing an existing agent's brain is out of scope; routing, spawning and
  supervising their processes is in scope. See [AGENT_ORCHESTRATOR.md](./AGENT_ORCHESTRATOR.md).

## User Control

- The user owns: providers, API keys, repositories, context, sessions, agents.
- No defaults that surprise the user into spending tokens, uploading code, or
  starting processes.

## Clear Feature Status

- Features are explicitly marked `[IMPLEMENTED]`, `[PARTIAL]`, `[EXPERIMENTAL]`,
  `[PLANNED]`, or `[DEPRECATED]`. See [FEATURE_STATUS.md](./FEATURE_STATUS.md)
  and [CURRENT_STATE.md](./CURRENT_STATE.md).