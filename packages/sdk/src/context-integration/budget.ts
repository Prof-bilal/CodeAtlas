import { estimateTokens } from "@atlas/shared";
import type { BudgetRecord, ContextBudget, ContextPackageItem } from "./models";

/** The default budget for a context package (overridable per call). */
export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxItems: 20,
  maxTokensPerItem: 2000,
  maxTokensTotal: 12000,
};

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
 *   while never dropping `instructions`. `dependency-chain` files (the graph
 *   hop-expansion for dependency-intent tasks) also survive the item-count cap
 *   because they are the direct answer to the task, but they still yield to the
 *   token cap when the package is over budget.
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

  // The token cap may drop anything except project instructions and
  // critical-tier items (tier-first consumption, ADR-014: budgets prevent
  // explosion but never discard the files the task must touch).
  const dropableByTokens = (item: ContextPackageItem): boolean =>
    item.kind !== "instructions" && item.tier !== "critical";
  // The item-count cap additionally protects dependency-chain evidence files.
  const dropableByCount = (item: ContextPackageItem): boolean =>
    item.kind !== "instructions" && item.source !== "dependency-chain" && item.tier !== "critical";

  let current = truncated;
  let total = current.reduce((sum, item) => sum + item.tokens, 0);

  const droppedByTokens: string[] = [];
  while (total > budget.maxTokensTotal && current.some((item) => dropableByTokens(item))) {
    const tail = current[current.length - 1];
    if (tail === undefined || !dropableByTokens(tail)) {
      break;
    }
    droppedByTokens.push(tail.id);
    current = current.slice(0, -1);
    total -= tail.tokens;
  }
  const budgetExceeded = total > budget.maxTokensTotal;

  const itemsDroppedByCount: string[] = [];
  while (current.length > budget.maxItems && current.some((item) => dropableByCount(item))) {
    const tail = current[current.length - 1];
    if (tail === undefined || !dropableByCount(tail)) {
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
