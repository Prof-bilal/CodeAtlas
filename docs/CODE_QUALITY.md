# CodeAtlas Code Quality

Coding standards for every source file in this monorepo.

---

## 1. Language & tooling baseline

- **TypeScript, strict mode.** `tsconfig.base.json` sets `strict: true` plus
  `noImplicitAny`, `noImplicitOverride`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`,
  `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, `isolatedModules`.
- **Lint:** ESLint (correctness + `no-restricted-imports` dependency matrix).
- **Format:** Biome (`pnpm format` / `format:check`).

## 2. Rules

- **Avoid `any`.** `@typescript-eslint/no-explicit-any` is an error. Prefer
  precise types, generics, or branded types. If `any` is truly unavoidable,
  isolate it behind a narrow, documented boundary.
- **Small functions.** One obvious job per function; split early.
- **Clear names.** Name for the reader: intent-revealing, no abbreviation soup.
- **Explicit interfaces.** Type everything public; `interface` over `type`
  (`consistent-type-definitions`). Use `import type` for cross-package types.
- **No unnecessary abstraction.** Add a layer only when two+ real callers
  exist, not in anticipation. Simplicity > cleverness.
- **No duplicated logic.** Shared behavior goes in `shared` or `core`; do not
  copy-paste across packages. (The one documented exception — graph/parser
  module resolution — is deliberate and recorded in ARCHITECTURE.md.)
- **No dead code.** Unused exports, unused imports, and unreachable branches
  are errors (`noUnusedLocals`/`noUnusedParameters`). Delete, don't comment out.
- **No commented-out code.** Git history is the record.
- **No magic constants.** Name the constant (`SHA256_HEX_LENGTH`,
  `MAX_CONTENT_CHARS`, timeout ms) with a comment when non-obvious.
- **Validate external input.** Anything that crosses a boundary (CLI args, file
  content, provider responses, repo-derived paths) is validated — see
  [SECURITY.md](./SECURITY.md).
- **Handle errors intentionally.** Use the `Result` monad 
  (`ok`/`fail`) for expected outcomes; throw only for programming errors. Map
  errors to meaningful messages. Never swallow.
- **Readable over clever.** If reviewers need to slow-read it, split it.

## 3. Enforced by tooling

`pnpm check` = typecheck + lint + format + test (the quality gate). Husky +
lint-staged run it on staged files; commitlint enforces Conventional Commits
(`feat:`, `fix:`, `chore:`, `docs:` etc.).

## 4. Review lens (for humans and AI reviewers)

- is it typed precisely? No `any`?
- single responsibility per function/package?
- duplicated logic anywhere?
- errors intentional + safe (no leaked secrets)?
- is the smallest change that satisfies the requirements?