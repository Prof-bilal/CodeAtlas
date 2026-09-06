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
 *   while never dropping `instructions`. Both caps scan from the tail for the
 *   lowest-ranked *droppable* item, so a protected item at the very tail
 *   (e.g. a graph-reached `traversal` file that outranks plain lexical hits by
 *   tier) does not stall the whole enforcement.
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

  // The token cap may drop anything except project instructions,
  // critical-tier items (tier-first consumption, ADR-014: budgets prevent
  // explosion but never discard the files the task must touch), and
  // the repository digest (always relevant architectural context).
  const dropableByTokens = (item: ContextPackageItem): boolean =>
    item.kind !== "instructions" && item.kind !== "digest" && item.tier !== "critical";
  // The item-count cap protects essential context, critical-tier items, and
  // graph-reached traversal evidence (Tier 2): the traversal files are the
  // multi-hop structural answer, and plain lexical hits (Tier 3) yield first.
  const dropableByCount = (item: ContextPackageItem): boolean =>
    item.kind !== "instructions" &&
    item.kind !== "digest" &&
    item.source !== "traversal" &&
    item.source !== "dependency-chain" &&
    item.tier !== "critical";

  const current = truncated;
  let total = current.reduce((sum, item) => sum + item.tokens, 0);

  const droppedByTokens: string[] = [];
  while (total > budget.maxTokensTotal && current.some((item) => dropableByTokens(item))) {
    const index = lastDroppableIndex(current, dropableByTokens);
    if (index === -1) {
      break;
    }
    const [removed] = current.splice(index, 1);
    droppedByTokens.push(removed.id);
    total -= removed.tokens;
  }
  const budgetExceeded = total > budget.maxTokensTotal;

  const itemsDroppedByCount: string[] = [];
  while (current.length > budget.maxItems && current.some((item) => dropableByCount(item))) {
    const index = lastDroppableIndex(current, dropableByCount);
    if (index === -1) {
      break;
    }
    const [removed] = current.splice(index, 1);
    itemsDroppedByCount.push(removed.id);
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

/**
 * Index of the lowest-ranked droppable item, scanning from the tail. Returns
 * `-1` when no item satisfies the predicate. Scanning (rather than checking
 * only the last item) lets a protected tail (e.g. traversal evidence that
 * outranks lexical hits) coexist with enforcement that drops the lexical hits
 * above it.
 */
function lastDroppableIndex(
  items: readonly ContextPackageItem[],
  droppable: (item: ContextPackageItem) => boolean,
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (droppable(items[index]!)) {
      return index;
    }
  }
  return -1;
}
