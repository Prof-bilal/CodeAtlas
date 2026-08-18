/**
 * Token estimation utilities for metrics.
 *
 * These are **documented heuristics** — quantities derived from them are
 * estimates, never exact provider-reported values.
 *
 * Canonical implementations live in `@atlas/shared`; this module re-exports
 * them so existing `@atlas/metrics` consumers keep a stable import path.
 */
export {
  calculateSavings,
  estimateBaselineTokens,
  estimateTokens,
} from "@atlas/shared";
