/**
 * Deterministic, dependency-free character→token estimate (~4 characters per
 * token). This is a **documented heuristic** — quantities derived from it must
 * carry `estimated` provenance, never `actual`. CodeAtlas never silently
 * guesses; callers opt in to estimation at the collection seam.
 *
 * This is the single canonical implementation — `@atlas/metrics`,
 * `@atlas/usage`, and `@atlas/sdk` re-export or import it rather than forking.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate baseline tokens (what the user would send without CodeAtlas).
 * This is the total lines × average characters per line / 4.
 * In practice, this is an approximation of "sending the whole repository".
 */
export function estimateBaselineTokens(totalLines: number, avgCharsPerLine = 40): number {
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
