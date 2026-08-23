# ADR-011 — Ollama Tool Loop (Phase 3)

## Status

**Accepted** — 2026-08-22

## Context

Phase 1 (Ollama provider with tool-calling support) and Phase 2 (chat agent
runtime + session dispatch) are implemented. Ollama can now receive a prompt
with tool definitions and respond with `tool_calls` in the response. However,
the `ProviderChatAgent` runner ignores `tool_calls` entirely — it performs a
single provider call and returns the text content, never executing tools or
feeding results back.

**Goal:** Allow the selected Ollama model to request repository context
mid-turn via CodeAtlas context tools, receive the results, and continue
reasoning — a bounded tool loop.

## Decision

### 1. Conversation history via `messages` field

Extend `ProviderRequest` with an optional `messages` field
(`{ role: string; content: string; tool_call_id?: string }[]`). When
present, adapters use `messages` instead of constructing a single user
message from `prompt`. This is backward-compatible: every adapter falls
back to `prompt` when `messages` is absent.

### 2. `ContextToolSource` — dependency-inverted tool bridge

Define a `ContextToolSource` interface in `@atlas/sdk` (not in core,
since it's a composition seam, not a domain port):

```ts
interface ContextToolSource {
  listTools(): ToolDefinition[];
  execute(name: string, args: Record<string, unknown>): Promise<Result<unknown>>;
}
```

This inverts the dependency: the SDK defines the interface; `@atlas/mcp`
implements it using its existing `TOOLS` + `HANDLERS`. No duplicate
registry.

### 3. Zod-to-JSON-schema conversion

Write a minimal, dependency-free converter for the subset of zod types
used in `mcp/src/tools.ts` (string, number, boolean, enum, object,
optional, describe, int/min/max). This avoids adding `zod-to-json-schema`
as a direct dependency and keeps the dependency graph clean. The converter
lives in `@atlas/mcp` (it imports zod already).

### 4. Tool loop agent in `@atlas/sdk`

Create `ToolUsingChatAgent` in `packages/sdk/src/context-tools/`:

- Wraps `ProviderPort` + `ContextToolSource`
- Implements `ChatAgentPort` (runs when provider is `"ollama"`)
- Loop: send prompt+tools → if `toolCalls` present: parse args, execute
  via `ContextToolSource`, append results as `{ role: "tool" }` messages,
  re-call `complete()` → repeat until no tool calls or `MAX_TOOL_ROUNDS`
  (default 10)
- Unknown tool names → error result fed back (not thrown)
- Per-result budget cap: `MAX_TOOL_RESULT_CHARS` (20,000 chars)
  — oversized results truncated, matching ADR-008 budget philosophy

### 5. Security: deny filter

Apply `denyFilter` from `context-integration/deny.ts` to `read_file_range`
calls. If a denied file is requested, return an error result. The deny
filter already handles `.env*`, credentials, private keys, etc.

### 6. Wiring

- `createSessionManager()` gains an optional `contextToolSource` parameter
- When provided, the default `ProviderChatAgent` is replaced with
  `ToolUsingChatAgent` that wraps the same `ProviderPort` + the tool source
- CLI's `withIntegration()` passes the MCP adapter when creating the
  session manager, reusing `TOOLS`/`HANDLERS` from `@atlas/mcp`

## Consequences

- No duplicate tool registry: `mcp/src/tools.ts` remains the single source
  of truth
- `sdk` does NOT import `mcp` — the dependency inversion is through the
  injected `ContextToolSource` interface
- The loop is bounded and fails safely (unknown tools, timeout, max
  iterations)
- Other providers (Claude, Gemini) can later adopt the same loop by
  implementing `ProviderPort.complete()` with `messages` support
