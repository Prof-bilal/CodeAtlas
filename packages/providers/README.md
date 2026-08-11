# @atlas/providers

AI model provider adapters for CodeAtlas. A single `ProviderPort` abstraction
over Claude, OpenAI, Gemini, and DeepSeek, with an extensible registry so new
providers can be added without touching callers.

Implements `ProviderPort` from `@atlas/core`.

> **Status: implemented.** Four adapters and the registry are built and tested
> against a fake transport; no real API calls are made in tests.

## Features

- **Provider adapters** — `Claude`, `OpenAI`, `Gemini`, `DeepSeek` behind one
  interface, using an injectable HTTP transport (`fetch` by default).
- **Structured JSON mode** — `ProviderRequest.json` sets each provider's JSON
  response knob (`response_format`, `responseMimeType`, …).
- **Registry** — configure built-ins in the constructor or `register()` any
  `ProviderAdapter` to add a provider at runtime.
- **Accountability** — every response carries `provider`, `model`, and `usage`
  (prompt/completion tokens).

## Usage

```ts
import { ProviderService } from "@atlas/providers";

const service = new ProviderService({
  providers: {
    claude: { apiKey: process.env.CLAUDE_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY },
  },
});

const result = await service.complete({
  provider: "openai",
  prompt: "Summarize the following code.",
  json: true,
});
```

## Public API

- `ProviderService` — routes `complete` to an adapter by name (default
  `"claude"`); `register(adapter)`; `listProviders()`.
- `ClaudeAdapter` / `OpenAIAdapter` / `GeminiAdapter` / `DeepSeekAdapter` — the
  built-in adapters (each takes a `ProviderConfig` + `HttpTransport`).
- `HttpTransport` / `fetchTransport` — the network seam (inject a fake in tests).
- `UnknownProviderError` / `ProviderRequestError` — failure types.

## Adding a provider

Implement `ProviderAdapter` (id, default model, `complete`) and register it:

```ts
import type { ProviderAdapter } from "@atlas/providers";

const myProvider: ProviderAdapter = {
  name: "local",
  defaultModel: "local-1",
  complete: async () => ({ ok: true, value: { provider: "local", content: "…", model: "local-1" } }),
};
service.register(myProvider);
```

## Limitations

- Real calls require API keys configured at runtime; tests exercise request
  shaping against a fake transport.
- Default models are placeholders (`claude-sonnet-5`, `gpt-4o`, `gemini-1.5-pro`,
  `deepseek-chat`), overridable per request via `ProviderRequest.model`.