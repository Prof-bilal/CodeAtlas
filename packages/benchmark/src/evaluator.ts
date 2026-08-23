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

/**
 * Extract repository-relative paths cited in text and verify they exist on disk.
 */
export function citedPaths(text: string, repoAbsPath: string): string[] {
  const pattern =
    /\b(?:lib|src|test|tests|spec|packages|scripts|docs|tools|typings|bin)\/[A-Za-z0-9_./-]+\.(?:js|ts|tsx|jsx|mjs|cjs|d\.ts|json|md)/g;
  const found = new Set<string>();
  for (const m of text.match(pattern) ?? []) {
    const p = m.replace(/[.,;:)"]+$/, "");
    if (existsSync(join(repoAbsPath, p))) {
      found.add(p);
    } else if (existsSync(join(repoAbsPath, p.replace(/^\.\//, "")))) {
      found.add(p.replace(/^\.\//, ""));
    }
  }
  return [...found];
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
  };
}
