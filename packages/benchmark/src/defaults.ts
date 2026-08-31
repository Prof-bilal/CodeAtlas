/**
 * Per-provider default budget configuration (P8.3).
 *
 * Recommended token budgets and cost limits for each provider when running
 * benchmark tasks. These are advisory — the benchmark service applies them
 * when `BenchmarkConfig.budgetDefaults` is set.
 *
 * Import and use as:
 * ```ts
 * import { PROVIDER_BUDGET_DEFAULTS } from "@atlas/benchmark";
 * const budget = PROVIDER_BUDGET_DEFAULTS["ollama"];
 * ```
 */

import type { ModelBudgetDefaults } from "@atlas/core";

/**
 * Default budget configuration per provider.
 *
 * Key is the provider name as used in model identifiers (e.g. "ollama",
 * "opencode", "openai"). Values encode recommended limits for local
 * models (where latency and cost are user-hosted) and cloud providers
 * (where cost is metered).
 */
export const PROVIDER_BUDGET_DEFAULTS: Readonly<Record<string, ModelBudgetDefaults>> = {
  /**
   * Local Ollama models — no cost, but latency is GPU-bound.
   * Budget is generous to allow multi-step tool loops.
   */
  ollama: {
    maxTokensPerTask: 32_000,
    maxCostPerTask: 0,
    maxDurationMs: 600_000, // 10 minutes (local models are slower)
  },

  /**
   * OpenCode free-tier cloud models — $0 cost, rate-limited.
   * Tighter budget to avoid hitting rate limits during ablation sweeps.
   */
  opencode: {
    maxTokensPerTask: 16_000,
    maxCostPerTask: 0,
    maxDurationMs: 300_000, // 5 minutes
  },

  /**
   * OpenAI API — metered by token.
   * Conservative budget to prevent cost overruns on benchmark runs.
   */
  openai: {
    maxTokensPerTask: 8_000,
    maxCostPerTask: 0.05, // $0.05 per task
    maxDurationMs: 120_000, // 2 minutes
  },

  /**
   * Anthropic API — metered by token.
   */
  anthropic: {
    maxTokensPerTask: 8_000,
    maxCostPerTask: 0.1, // $0.10 per task
    maxDurationMs: 120_000, // 2 minutes
  },

  /**
   * Google Gemini API — metered by token.
   */
  google: {
    maxTokensPerTask: 8_000,
    maxCostPerTask: 0.05, // $0.05 per task
    maxDurationMs: 120_000, // 2 minutes
  },
};

/**
 * Resolve effective budget for a given provider and model.
 *
 * Merges provider-specific defaults with any per-model overrides from the
 * benchmark config. Returns the most restrictive limit.
 */
export function resolveBudget(
  provider: string,
  configDefaults?: ModelBudgetDefaults,
): {
  readonly maxTokensPerTask: number;
  readonly maxCostPerTask: number;
  readonly maxDurationMs: number;
} {
  const providerDefaults = PROVIDER_BUDGET_DEFAULTS[provider];
  const perProvider = configDefaults?.perProvider?.[provider];

  const maxTokensPerTask =
    configDefaults?.maxTokensPerTask ??
    perProvider?.maxTokensPerTask ??
    providerDefaults?.maxTokensPerTask ??
    0;

  const maxCostPerTask =
    configDefaults?.maxCostPerTask ??
    perProvider?.maxCostPerTask ??
    providerDefaults?.maxCostPerTask ??
    0;

  const maxDurationMs =
    configDefaults?.maxDurationMs ??
    perProvider?.maxDurationMs ??
    providerDefaults?.maxDurationMs ??
    540_000;

  return { maxTokensPerTask, maxCostPerTask, maxDurationMs };
}
