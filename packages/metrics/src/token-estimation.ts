/**
 * Token estimation utilities for metrics.
 *
 * These are **documented heuristics** — quantities derived from them are
 * estimates, never exact provider-reported values.
 *
 * Canonical implementations live in `@prof-bilal/atlas-shared`; this module re-exports
 * them so existing `@prof-bilal/atlas-metrics` consumers keep a stable import path.
 */
export {
  calculateSavings,
  estimateBaselineTokens,
  estimateTokens,
} from "@prof-bilal/atlas-shared";
