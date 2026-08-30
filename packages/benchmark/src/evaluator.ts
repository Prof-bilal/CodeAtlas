import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { BenchmarkEvaluation, TaskDefinition } from "@atlas/core";

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s.toLowerCase().replace(/[_/-]/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// File / concept hit detection
// ---------------------------------------------------------------------------

/**
 * Find which expected files are referenced in the haystack text.
 * Matches against the basename of each expected file.
 */
export function fileHits(expectedFiles: readonly string[], haystack: string): string[] {
  const n = norm(haystack);
  const hits: string[] = [];
  for (const f of expectedFiles) {
    if (n.includes(norm(basename(f)))) hits.push(f);
  }
  return hits;
}

/**
 * Find which expected concepts appear in the final text.
 */
export function conceptHits(concepts: readonly string[], finalText: string): string[] {
  const n = norm(finalText);
  const hits: string[] = [];
  for (const c of concepts) {
    if (n.includes(norm(c))) hits.push(c);
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
): BenchmarkEvaluation {
  const fileHaystack = `${finalText}\n${toolCallOutputs.join("\n")}`;
  const filesFound = fileHits(task.expected_files, fileHaystack);
  const conceptsFound = conceptHits(task.expected_concepts, finalText);
  const cited = citedPaths(finalText, repoAbsPath);

  const filesExpected = task.expected_files.length;
  const conceptsExpected = task.expected_concepts.length;
  const fileRatio = filesExpected > 0 ? filesFound.length / filesExpected : 0;
  const conceptRatio = conceptsExpected > 0 ? conceptsFound.length / conceptsExpected : 0;

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
