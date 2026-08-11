import type { ContextBudget, ContextPackageItem, BudgetRecord } from "./models";

/** The default budget for a context package (overridable per call). */
export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxItems: 20,
  maxTokensPerItem: 2000,
  maxTokensTotal: 12000,
};

/**
 * Deterministic, dependency-free token estimate: one token per ~4 characters.
 * Used only to *cap* a package — it is a heuristic, not a real tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Apply the budget to an ordered list of items and return the surviving items
 * plus a record of what the enforcement did.
 *
 * Policy (deterministic and explainable):
 * - **Essential items** (`instructions` and `overview`) always come first in the
 *   input; they are truncated by the per-item cap but are **never dropped**.
 * - **Per-item cap** truncates any item's content (from the end) and marks it.
 * - **Total token cap** drops items **from the tail** (lowest-ranked) until the
 *   package fits; `budgetExceeded` is set when even the essential items alone
 *   would exceed the cap.
 * - **Max-items cap** drops the tail (ranked items first, then the overview)
 *   while never dropping `instructions`.
 *
 * @param items - Items ordered with essential context first, then rank-descending.
 * @param budget - The effective budget to enforce.
 */
export function applyBudget(
  items: readonly ContextPackageItem[],
  budget: ContextBudget,
): { readonly items: readonly ContextPackageItem[]; readonly record: BudgetRecord } {
  const itemsTruncated: string[] = [];
  const truncated = items.map((item) =>
    truncateToTokens(item, budget.maxTokensPerItem, itemsTruncated),
  );

  // Drop from the tail, preserving essential (instructions/overview) items.
  const dropable = (item: ContextPackageItem): boolean =>
    item.kind === "instructions" ? false : true;

  let current = truncated;
  let total = current.reduce((sum, item) => sum + item.tokens, 0);

  const droppedByTokens: string[] = [];
  while (total > budget.maxTokensTotal && current.some((item) => dropable(item))) {
    const tail = current[current.length - 1];
    if (tail === undefined || !dropable(tail)) {
      break;
    }
    droppedByTokens.push(tail.id);
    current = current.slice(0, -1);
    total -= tail.tokens;
  }
  const budgetExceeded = total > budget.maxTokensTotal;

  const itemsDroppedByCount: string[] = [];
  while (current.length > budget.maxItems && current.some((item) => dropable(item))) {
    const tail = current[current.length - 1];
    if (tail === undefined || !dropable(tail)) {
      break;
    }
    itemsDroppedByCount.push(tail.id);
    current = current.slice(0, -1);
  }

  const tokensEstimated = current.reduce((sum, item) => sum + item.tokens, 0);
  const record: BudgetRecord = {
    budget,
    itemsRequested: items.length,
    itemsIncluded: current.length,
    tokensEstimated,
    itemsDroppedByCount,
    itemsTruncated,
    droppedByTokens,
    budgetExceeded,
  };
  return { items: current, record };
}

/** Truncate a single item's content to the per-item token cap (marks it). */
function truncateToTokens(
  item: ContextPackageItem,
  cap: number,
  truncatedIds: string[],
): ContextPackageItem {
  if (item.tokens <= cap) {
    return item;
  }
  truncatedIds.push(item.id);
  const charCap = cap * 4;
  const content = `${item.content.slice(0, charCap).trimEnd()}\n… [truncated]`;
  return { ...item, content, tokens: estimateTokens(content), truncated: true };
}
