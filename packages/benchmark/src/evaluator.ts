import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { BenchmarkEvaluation, TaskDefinition } from "@atlas/core";

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s.toLowerCase().replace(/[_/-]/g, " ").replace(/\s+/g, " ").trim();
}

/** Common words that never carry matching signal on their own. */
const STOP_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "when",
  "how",
  "are",
  "was",
  "not",
  "but",
  "has",
  "have",
  "its",
  "it's",
  "all",
  "any",
]);

/**
 * Split normalized text into significant tokens (len ≥ 3, stop-words removed).
 */
function tokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

/**
 * Fuzzy token equality: exact, or a shared prefix of ≥ 4 chars (so
 * "handler" ≈ "handling", "create" ≈ "creating") without confusing short
 * or unrelated words.
 */
function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  let common = 0;
  const len = Math.min(a.length, b.length);
  while (common < len && a[common] === b[common]) common += 1;
  return common >= 4;
}

function allTokensPresent(needles: string[], haystackTokens: Set<string>): boolean {
  return needles.every((n) => [...haystackTokens].some((h) => tokenMatches(n, h)));
}

/** Basename of a file path with its extension stripped, tokenized. */
function basenameTokens(file: string): string[] {
  const base = basename(file).replace(/\.[A-Za-z0-9]{1,8}$/, "");
  return tokens(base);
}

// ---------------------------------------------------------------------------
// File / concept hit detection
// ---------------------------------------------------------------------------

/**
 * Find which expected files are referenced in the haystack text.
 *
 * Match strategies (first hit wins, in order of strictness):
 *   1. normalized basename substring (existing behavior — still primary),
 *   2. basename-without-extension token overlap (so "create logger" matches
 *      `create-logger.ts` even when the model cites a different extension),
 *   3. normalized full-path substring (model cited a deeper/suffix path).
 */
export function fileHits(expectedFiles: readonly string[], haystack: string): string[] {
  const n = norm(haystack);
  const hayTokens = new Set(tokens(haystack));
  const hits: string[] = [];
  for (const f of expectedFiles) {
    const base = norm(basename(f));
    if (n.includes(base)) {
      hits.push(f);
      continue;
    }
    const bt = basenameTokens(f);
    if (bt.length > 0 && allTokensPresent(bt, hayTokens)) {
      hits.push(f);
      continue;
    }
    if (n.includes(norm(f))) hits.push(f);
  }
  return hits;
}

/**
 * Find which expected concepts appear in the final text.
 *
 * Match strategies (first hit wins):
 *   1. normalized phrase substring (existing behavior — still primary),
 *   2. token-set match: every significant concept token appears in the text
 *      under fuzzy token equality ("error handler" matches an answer that
 *      talks about "error-handling flow").
 */
export function conceptHits(concepts: readonly string[], finalText: string): string[] {
  const n = norm(finalText);
  const textTokens = new Set(tokens(finalText));
  const hits: string[] = [];
  for (const c of concepts) {
    if (n.includes(norm(c))) {
      hits.push(c);
      continue;
    }
    const ct = tokens(c);
    if (ct.length > 0 && allTokensPresent(ct, textTokens)) hits.push(c);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Cited-path extraction and verification
// ---------------------------------------------------------------------------

/**
 * Extract repository-relative path-like strings cited in text (pure text
 * extraction, no filesystem access). Shared by {@link citedPaths} and
 * {@link hallucinatedPaths}.
 */
export function citedPathCandidates(text: string): string[] {
  const pattern =
    /\b(?:lib|src|test|tests|spec|packages|scripts|docs|tools|typings|bin)\/[A-Za-z0-9_./-]+\.(?:js|ts|tsx|jsx|mjs|cjs|d\.ts|json|md)/g;
  const found = new Set<string>();
  for (const m of text.match(pattern) ?? []) {
    found.add(m.replace(/[.,;:)"]+$/, ""));
  }
  return [...found];
}

/** Resolve a cited path candidate against the repo (handles `./` prefix). */
function resolveCitedPath(p: string, repoAbsPath: string): string | null {
  if (existsSync(join(repoAbsPath, p))) return p;
  const stripped = p.replace(/^\.\//, "");
  if (existsSync(join(repoAbsPath, stripped))) return stripped;
  return null;
}

/**
 * Extract repository-relative paths cited in text and verify they exist on disk.
 */
export function citedPaths(text: string, repoAbsPath: string): string[] {
  const found = new Set<string>();
  for (const p of citedPathCandidates(text)) {
    const resolved = resolveCitedPath(p, repoAbsPath);
    if (resolved !== null) found.add(resolved);
  }
  return [...found];
}

/**
 * Extract repository-relative paths cited in text that do NOT exist on disk
 * (hallucination signal). Paths that exist are excluded — they belong to
 * {@link citedPaths}.
 */
export function hallucinatedPaths(text: string, repoAbsPath: string): string[] {
  const existing = new Set(citedPaths(text, repoAbsPath));
  return citedPathCandidates(text).filter(
    (p) => resolveCitedPath(p, repoAbsPath) === null && !existing.has(p),
  );
}

/**
 * Paths cited (and existing) that are NOT in the task's gold impact set —
 * the wrong-file signal for code-touching tasks. Returns `undefined` when the
 * task declares no gold impact set (not applicable).
 */
export function wrongFiles(
  cited: readonly string[],
  goldImpactFiles: readonly string[] | undefined,
): string[] | undefined {
  if (goldImpactFiles === undefined) return undefined;
  const gold = new Set(goldImpactFiles);
  return cited.filter((p) => !gold.has(p));
}

// ---------------------------------------------------------------------------
// Main evaluation
// ---------------------------------------------------------------------------

/**
 * Automatically evaluate a benchmark task result.
 *
 * Scoring:
 *   2 (correct)        — fileRatio >= 0.5 AND conceptRatio >= 0.5
 *   1 (partially_correct) — fileRatio >= 0.2 OR conceptRatio >= 0.2
 *   0 (incorrect)      — response has content but low ratios
 *   0 (failed)         — response is empty or too short
 *
 * Additionally reports (Phase 0, small-model intelligence benchmark):
 *   hallucinatedFiles  — cited paths that do not exist on disk
 *   wrongFiles         — cited existing paths outside `gold_impact_files`
 *   goldImpactFiles    — the task's declared gold impact set
 *
 * These extra fields do not affect `score`/`status`; hidden-test task
 * completion is measured separately by the explicit test runner.
 */
export function evaluateTask(
  task: TaskDefinition,
  finalText: string,
  toolCallOutputs: string[],
  repoAbsPath: string,
  options?: { timedOut?: boolean },
): BenchmarkEvaluation {
  const fileHaystack = `${finalText}\n${toolCallOutputs.join("\n")}`;
  const filesFound = fileHits(task.expected_files, fileHaystack);
  const conceptsFound = conceptHits(task.expected_concepts, finalText);
  const cited = citedPaths(finalText, repoAbsPath);

  const filesExpected = task.expected_files.length;
  const conceptsExpected = task.expected_concepts.length;
  const fileRatio = filesExpected > 0 ? filesFound.length / filesExpected : 0;
  const conceptRatio = conceptsExpected > 0 ? conceptsFound.length / conceptsExpected : 0;

  // A timed-out run never completed the task: cap the score at 0 ("failed")
  // regardless of file evidence. `filesFound`/`conceptsFound` stay in the
  // evaluation as diagnostics but do not earn partial credit from a truncated
  // transcript (Phase B fix: the old scoring gave timed-out baselines an
  // artifact advantage over completed runs).
  if (options?.timedOut === true) {
    const hallucinated = hallucinatedPaths(finalText, repoAbsPath);
    return {
      score: 0,
      status: "failed",
      filesFound,
      filesExpected: [...task.expected_files],
      fileRatio: Math.round(fileRatio * 100) / 100,
      conceptsFound,
      conceptsExpected: [...task.expected_concepts],
      conceptRatio: Math.round(conceptRatio * 100) / 100,
      citedFiles: cited,
      ...(hallucinated.length > 0 ? { hallucinatedFiles: hallucinated } : {}),
    };
  }

  let score: number;
  let status: BenchmarkEvaluation["status"];

  if (fileRatio >= 0.5 && conceptRatio >= 0.5) {
    score = 2;
    status = "correct";
  } else if (fileRatio >= 0.2 || conceptRatio >= 0.2) {
    score = 1;
    status = "partially_correct";
  } else if (finalText.trim().length > 20) {
    score = 0;
    status = "incorrect";
  } else {
    score = 0;
    status = "failed";
  }

  const goldImpactFiles = task.gold_impact_files;
  const wrong = wrongFiles(cited, goldImpactFiles);
  const hallucinated = hallucinatedPaths(finalText, repoAbsPath);

  return {
    score,
    status,
    filesFound,
    filesExpected: [...task.expected_files],
    fileRatio: Math.round(fileRatio * 100) / 100,
    conceptsFound,
    conceptsExpected: [...task.expected_concepts],
    conceptRatio: Math.round(conceptRatio * 100) / 100,
    citedFiles: cited,
    ...(hallucinated.length > 0 || cited.length > 0 ? { hallucinatedFiles: hallucinated } : {}),
    ...(wrong !== undefined
      ? { wrongFiles: wrong, goldImpactFiles: [...(goldImpactFiles ?? [])] }
      : {}),
  };
}
