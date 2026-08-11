/**
 * Deterministic, dependency-free character→token estimate (~4 characters per
 * token). This is a **documented heuristic** — quantities derived from it must
 * carry `estimated` provenance, never `actual` (see `docs/USAGE.md`). It is
 * opt-in at the collection seam; CodeAtlas never silently guesses.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
