# @atlas/summary

The AI summary engine for CodeAtlas. Generates **structured** summaries of
files, folders, modules, and projects from a language model, caches every
summary by content hash so unchanged code is never re-summarized, and records
token usage + generation metadata.

Implements `SummaryPort` from `@atlas/core`.

> **Status: implemented.** File / folder / module / project summaries, caching,
> change-skipping, and custom prompts are built and tested against a fake
> provider.

## Features

- **Four summary kinds** — `summarizeFile`, `summarizeFolder`, `summarizeModule`,
  `summarizeProject`.
- **Structured JSON** — the model's JSON is parsed into a typed `Summary`
  (`overview` + `keyPoints`), not left as prose.
- **Only changed files** — summaries are cached keyed by the content hash; a
  file is only sent to the model the first time its current content is seen.
- **Never regenerate unchanged** — folder/module/project summaries reuse their
  per-file summaries and only regenerate when the aggregate content changes.
- **Custom prompts** — override the built-in template with `{path}`, `{content}`
  / `{kind}`, `{target}`, `{files}` placeholders.
- **Metadata** — every summary carries `model`, `provider`, `prompt`, `cacheHit`,
  `durationMs`, and token usage.

## Usage

```ts
import { SummaryService } from "@atlas/summary";

const summary = new SummaryService({ provider, cache, hash });

const result = await summary.summarizeFile({ path: "/src/a.ts", language: "typescript", content: "…" });
if (result.ok) {
  console.log(result.value.content.overview);
  console.log(result.value.metadata.totalTokens);
}

const project = await summary.summarizeProject(allFiles, { prompt: "Focus on performance concerns in {kind}." });
```

## Public API

- `SummaryService` — the `SummaryPort` implementation (constructor takes
  `{ provider, cache, hash }`).
- `summarizeFile` / `summarizeFolder` / `summarizeModule` / `summarizeProject`.
- `SummaryOptions` — `{ prompt?, model?, force? }`; `Summary`, `SummaryContent`,
  `SummaryMetadata` (from core).
- Prompt helpers: `FILE_PROMPT_TEMPLATE`, `SCOPE_PROMPT_TEMPLATE`, `render`,
  `truncateContent`.

## Composing

The SDK container wires a `SummaryService` from its provider + cache + `HashService`:
`Container.create().getSummary()`.

## Limitations

- The model must return a JSON object with `overview` and `keyPoints`; a custom
  prompt that breaks that shape surfaces a `SummaryParseError`.
- Summaries are only as precise as the provider and the resolved inputs; live
  calls need a configured provider.