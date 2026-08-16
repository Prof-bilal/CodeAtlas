/**
 * Token estimation utilities for metrics.
 *
 * These are **documented heuristics** — quantities derived from them are
 * estimates, never exact provider-reported values. The existing
 * `estimateTokens` from `@atlas/usage` uses `Math.ceil(text.length / 4)`.
 * We reuse that formula for consistency.
 */

/** Estimate tokens from text using the character→token heuristic. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate baseline tokens (what the user would send without CodeAtlas).
 * This is the total lines × average characters per line / 4.
 * In practice, this is an approximation of "sending the whole repository".
 */
export function estimateBaselineTokens(totalLines: number, avgCharsPerLine: number = 40): number {
  return Math.ceil((totalLines * avgCharsPerLine) / 4);
}

/**
 * Calculate token savings from baseline and CodeAtlas context tokens.
 * Returns the saved count and savings percentage.
 */
export function calculateSavings(
  baselineTokens: number,
  codeatlasTokens: number,
): { saved: number; percent: number } {
  const saved = Math.max(0, baselineTokens - codeatlasTokens);
  const percent = baselineTokens > 0 ? (saved / baselineTokens) * 100 : 0;
  return { saved, percent: Math.round(percent * 100) / 100 };
}
