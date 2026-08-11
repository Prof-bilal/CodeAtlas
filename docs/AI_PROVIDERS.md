# AI Provider Architecture

How CodeAtlas talks to language models — **one interface, many adapters,
provider-specific logic quarantined inside adapters**.

**Status:** interface + adapters **[IMPLEMENTED]**; richer capabilities
(streaming, token counting) **[PLANNED]**. See
[CURRENT_STATE.md](./CURRENT_STATE.md).

---

## 1. The contract

The actual interface today (in `packages/core/src/ports/provider.port.ts`):

```ts
export interface ProviderRequest {
  provider?: string;   // adapter name, e.g. "claude"; defaults to service default
  model?: string;      // provider's configured default used otherwise
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;      // ask for structured JSON response
}

export interface ProviderResponse {
  provider: string;    // which adapter produced the response
  content: string;
  model: string;
  usage?: TokenUsage;  // input / output / total tokens
}

export interface ProviderPort {
  complete(request: ProviderRequest): Promise<Result<ProviderResponse>>;
}
```

### Target interface (planned)

The conceptual target may grow the port to surface lifecycle capabilities:

```ts
export interface AIProvider {
  complete(request: ProviderRequest): Promise<Result<ProviderResponse>>;
  stream?(request): AsyncIterable<...>;   // PLANNED
  countTokens?(text: string): number;      // PLANNED
  getModelInfo?(model?: string): ModelInfo; // PLANNED
}
```

> **Do not** add these methods until a consumer actually needs them (`stream` is
> likely to land first, for interactive CLI output). Extend the interface with
> real consumers, not in anticipation.

---

## 2. Adapters

| Provider     | Adapter           | Transport / API                            | Status |
| ------------ | ----------------- | ------------------------------------------ | ------ |
| Claude       | `ClaudeAdapter`   | Anthropic Messages (`fetch`)               | IMPLEMENTED |
| OpenAI       | `OpenAIAdapter`   | chat-completions (OpenAI-compatible)       | IMPLEMENTED |
| DeepSeek     | `DeepSeekAdapter` | chat-completions (OpenAI-compatible)       | IMPLEMENTED |
| Gemini       | `GeminiAdapter`   | `generateContent`                          | IMPLEMENTED |
| Ollama / other | (planned)        | local OpenAI-compatible or vendor API      | PLANNED |

- Adapters are registered in a **runtime registry** (`ProviderService.register`)
  — callers select by name, e.g. `complete({ provider: "gemini", ... })`.
- An unknown provider raises `UnknownProviderError`; request/transport failures
  raise `ProviderRequestError` (never a raw vendor exception leaking outward).

---

## 3. Rules

### Provider-specific logic lives in adapters — period.

- No `if (provider === "claude")` switches scattered across the application.
  The provider *name* is data, not control flow.
- The rest of the codebase sees only `ProviderPort`.

### API keys

- **Never committed** (`.env*` is gitignored; never commit `.env`),
- **never logged** (no adapter print the key),
- **never exposed in errors** (strip secrets before constructing error
  messages; sanitize responses).

### Transport is injectable

- Adapters receive an `HttpTransport` (default: global `fetch`). Tests inject a
  fake transport so no network is ever hit in the test suite.

### Default model ids

- Each adapter ships a **default model id**, but these are **not verified** and
  can go stale (see CURRENT_STATE.md §5). Prefer explicit `model` over implicit
  defaults in product code; treat adapter defaults as best-effort.

### Deterministic before AI

- Nothing in the analysis pipeline *requires* a provider. Summaries use
  providers; facts use the parser/graph.

---

## 4. Configuration & user control

- Providers are configured through `ProviderService` options (a map of provider
  name → config including api key/baseUrl/model/transport).
- **The user controls** which providers exist, which keys are used, and where
  traffic goes (local Ollama optional, cloud APIs opt-in).
- Because the default SDK `ProviderService()` registers **no** adapters,
  AI-enabled features require an explicitly configured provider — this is the
  "AI is optional" principle enforced by default.

---

## 5. Security reminders

See [SECURITY.md](./SECURITY.md) for the full policy. The provider-relevant
extras:

- Validate and escape everything derived from a response before using it.
- Rate-limit / retry with jitter and backoff for client errors only — never
  blindly retry auth failures (an invalid key should surface immediately).