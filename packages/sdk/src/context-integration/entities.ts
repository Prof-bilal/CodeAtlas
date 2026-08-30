/**
 * Deterministic task-entity extraction (Phase 1, P1.2 — small-model
 * intelligence execution plan).
 *
 * Pure, rule-based extraction of retrieval targets from a raw task string:
 * file paths mentioned verbatim, symbol-name candidates (PascalCase /
 * camelCase / snake_case / quoted), and lowercase keyword fallbacks. No AI, no
 * IO, no network — the same task text always yields the same entities.
 *
 * Extraction is deliberately conservative and bounded: everything is capped in
 * length and count so hostile or accidental giant inputs cannot explode
 * downstream search fan-out.
 */

import type { FilePath } from "@atlas/shared";

/** The extraction result for one task string. */
export interface TaskEntities {
  /** File paths mentioned in the task (normalized to forward slashes). */
  readonly filePaths: readonly FilePath[];
  /** Symbol-name candidates (ordered by appearance, deduped). */
  readonly symbolNames: readonly string[];
  /** Lowercase keyword fallbacks for lexical search. */
  readonly keywords: readonly string[];
}

/** Hard cap on the accepted task text — longer inputs are truncated. */
const MAX_INPUT_LENGTH = 4000;
/** Hard cap per extracted entity. */
const MAX_ENTITY_LENGTH = 200;
/** Hard caps per bucket — keeps search fan-out deterministic and bounded. */
const MAX_PATHS = 10;
const MAX_SYMBOLS = 15;
const MAX_KEYWORDS = 12;

/** Known code/config file extensions used to recognize bare file names. */
const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "mts",
  "cts",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "rb",
  "php",
  "cs",
  "c",
  "h",
  "cpp",
  "hpp",
  "swift",
  "scala",
  "json",
  "yaml",
  "yml",
  "toml",
  "md",
  "sql",
  "sh",
]);

/** Path-like tokens: `src/foo/bar.ts`, `packages/core/index.ts`, `a/b/c.py`. */
const PATH_TOKEN_RE = /[\w@./\\-]+\.[A-Za-z0-9]{1,8}/g;
/** Backtick- or quote-wrapped identifiers: `` `authenticate` ``, `'TaskService'`. */
const QUOTED_NAME_RE = /["'`]([A-Za-z_$][\w$]{1,63})["'`]/g;
/** camelCase / PascalCase identifiers with an uppercase interior. */
const CAMEL_NAME_RE = /\b[a-z]+[A-Z][A-Za-z0-9]{1,63}\b|\b[A-Z][a-z]+[A-Z][A-Za-z0-9]*\b/g;
/** snake_case identifiers. */
const SNAKE_NAME_RE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}\b/g;
/** Plain words for the keyword fallback. */
const WORD_RE = /[a-z][a-z0-9_-]{3,29}/g;

/** Words too generic to be useful as search keywords. */
const STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "into",
  "when",
  "then",
  "than",
  "they",
  "them",
  "there",
  "these",
  "those",
  "have",
  "has",
  "had",
  "was",
  "were",
  "will",
  "would",
  "should",
  "could",
  "shall",
  "must",
  "need",
  "needs",
  "want",
  "make",
  "made",
  "does",
  "done",
  "doing",
  "been",
  "being",
  "also",
  "some",
  "such",
  "only",
  "just",
  "like",
  "over",
  "under",
  "after",
  "before",
  "about",
  "which",
  "while",
  "where",
  "what",
  "your",
  "please",
  "thanks",
  "code",
  "file",
  "files",
  "function",
  "value",
  "tests",
  "test",
  "case",
  "update",
  "change",
  "changes",
  "using",
  "used",
  "uses",
  "type",
  "types",
  "class",
  "data",
  "name",
  "named",
  "item",
  "items",
  "list",
  "between",
]);

function sanitize(raw: string): string {
  // Truncate first (keeps downstream work bounded), then strip control
  // characters without a control-character regex (lint-clean by construction).
  const truncated = raw.length > MAX_INPUT_LENGTH ? raw.slice(0, MAX_INPUT_LENGTH) : raw;
  let out = "";
  for (const ch of truncated) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl =
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
    out += isControl ? " " : ch;
  }
  return out;
}

function normalizePath(candidate: string): string | null {
  if (candidate.length === 0 || candidate.length > MAX_ENTITY_LENGTH) {
    return null;
  }
  const normalized = candidate.replace(/\\/g, "/");
  // Reject scheme-like prefixes, absolute paths, and traversal segments.
  if (normalized.includes("://") || normalized.startsWith("/")) {
    return null;
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) {
    return null;
  }
  const base = segments[segments.length - 1];
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return null;
  }
  const ext = base.slice(dot + 1).toLowerCase();
  const hasDirectory = segments.length > 1;
  // Accept a bare file name only for known code extensions; any directory
  // segment makes any extension plausible.
  if (!hasDirectory && !CODE_EXTENSIONS.has(ext)) {
    return null;
  }
  if (base.startsWith(".env")) {
    // Secrets-adjacent files are never retrieval targets (SECURITY rules).
    return null;
  }
  return normalized;
}

function isSymbolLike(name: string): boolean {
  return (
    name.length >= 3 &&
    name.length <= MAX_ENTITY_LENGTH &&
    // Exclude anything that is itself a path-shaped token.
    !name.includes("/") &&
    !name.includes(".")
  );
}

/**
 * Extract deterministic retrieval entities from a task string.
 *
 * Pure and adversarial-safe: empty / control-character / oversized inputs
 * yield empty or truncated results and never throw.
 */
export function extractTaskEntities(task: string): TaskEntities {
  const text = sanitize(task);
  if (text.trim().length === 0) {
    return { filePaths: [], symbolNames: [], keywords: [] };
  }

  const filePaths: string[] = [];
  const seenPaths = new Set<string>();
  for (const match of text.matchAll(PATH_TOKEN_RE)) {
    const normalized = normalizePath(match[0]);
    if (normalized !== null && !seenPaths.has(normalized)) {
      seenPaths.add(normalized);
      filePaths.push(normalized);
      if (filePaths.length >= MAX_PATHS) {
        return finish(text, filePaths, []);
      }
    }
  }

  const symbols: string[] = [];
  const seenSymbols = new Set<string>();
  const pushSymbol = (raw: string | undefined): boolean => {
    if (raw === undefined || !isSymbolLike(raw)) {
      return false;
    }
    const key = raw.toLowerCase();
    if (seenSymbols.has(key) || seenPaths.has(raw)) {
      return false;
    }
    seenSymbols.add(key);
    symbols.push(raw);
    return symbols.length >= MAX_SYMBOLS;
  };
  for (const match of text.matchAll(QUOTED_NAME_RE)) {
    if (pushSymbol(match[1])) {
      return finish(text, filePaths, symbols);
    }
  }
  for (const match of text.matchAll(CAMEL_NAME_RE)) {
    if (pushSymbol(match[0])) {
      return finish(text, filePaths, symbols);
    }
  }
  for (const match of text.matchAll(SNAKE_NAME_RE)) {
    if (pushSymbol(match[0])) {
      return finish(text, filePaths, symbols);
    }
  }

  return finish(text, filePaths, symbols);
}

function finish(
  text: string,
  filePaths: readonly string[],
  symbols: readonly string[],
): TaskEntities {
  // Keyword fallback: lowercase words not already covered by a path or symbol.
  const covered = new Set<string>();
  for (const p of filePaths) {
    for (const part of p.toLowerCase().split(/[^a-z0-9]+/)) {
      covered.add(part);
    }
  }
  for (const s of symbols) {
    covered.add(s.toLowerCase());
  }
  const keywords: string[] = [];
  const seenKeywords = new Set<string>();
  for (const match of text.toLowerCase().matchAll(WORD_RE)) {
    const word = match[0];
    if (
      STOPWORDS.has(word) ||
      covered.has(word) ||
      seenKeywords.has(word) ||
      word.length > MAX_ENTITY_LENGTH
    ) {
      continue;
    }
    seenKeywords.add(word);
    keywords.push(word);
    if (keywords.length >= MAX_KEYWORDS) {
      break;
    }
  }
  return {
    filePaths: filePaths as readonly FilePath[],
    symbolNames: symbols,
    keywords,
  };
}
