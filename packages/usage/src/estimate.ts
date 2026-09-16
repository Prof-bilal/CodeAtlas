/**
 * Deterministic, dependency-free character→token estimate (~4 characters per
 * token). This is a **documented heuristic** — quantities derived from it must
 * carry `estimated` provenance, never `actual` (see `docs/reference/USAGE.md`). It is
 * opt-in at the collection seam; CodeAtlas never silently guesses.
 *
 * Canonical implementation lives in `@prof-bilal/atlas-shared`; this module re-exports it
 * so existing `@prof-bilal/atlas-usage` consumers keep a stable import path.
 */
export { estimateTokens } from "@prof-bilal/atlas-shared";
