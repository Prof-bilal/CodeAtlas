/**
 * MCP score normalization (Phase 1 truth-in-advertising).
 *
 * Lexical search emits 0..100; MCP schemas advertise 0..1. Normalize at the
 * protocol boundary and dual-emit `rawScore` so existing parsers can migrate.
 */

export type ScoreConfidence = "high" | "medium" | "low";

export interface NormalizedScore {
  /** Relevance on the advertised 0..1 scale. */
  readonly score: number;
  /** Original scorer value on the 0..100 scale (deprecation dual-emit). */
  readonly rawScore: number;
  /** Coarse band derived from the normalized score. */
  readonly confidence: ScoreConfidence;
}

/** Map a normalized 0..1 score to a confidence band. */
export function confidenceFromScore(score01: number): ScoreConfidence {
  if (score01 >= 0.85) return "high";
  if (score01 >= 0.5) return "medium";
  return "low";
}

/**
 * Normalize a lexical (0..100) score to the MCP 0..1 contract.
 * Values already in 0..1 (≤1) are treated as already-normalized and scaled
 * back to rawScore via ×100 for dual-emit consistency.
 */
export function normalizeScore(raw: number): NormalizedScore {
  const finite = Number.isFinite(raw) ? raw : 0;
  const isLegacyScale = finite > 1;
  const rawScore = isLegacyScale ? finite : finite * 100;
  const score = Math.min(1, Math.max(0, isLegacyScale ? finite / 100 : finite));
  return { score, rawScore, confidence: confidenceFromScore(score) };
}

/**
 * Convert a client `minScore` into the internal 0..100 scorer scale.
 * Values ≤1 are treated as 0..1 (schema contract); values >1 are legacy 0..100.
 */
export function toInternalMinScore(minScore: number): number {
  if (!Number.isFinite(minScore) || minScore <= 0) return 0;
  if (minScore <= 1) return minScore * 100;
  return minScore;
}
