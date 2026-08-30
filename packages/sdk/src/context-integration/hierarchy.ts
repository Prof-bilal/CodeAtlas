/**
 * Context hierarchy helpers (Phase 1, P1.5 — small-model intelligence
 * execution plan; ADR-014).
 *
 * Pure, deterministic helpers for tiered context delivery: tier ordering for
 * budget consumption, symbol outlines, and 1-based line-range slicing. No AI,
 * no IO — the same input always yields the same output.
 */

import type { ContextTier, LineRange } from "@atlas/core";

/**
 * Budget-consumption priority by tier (lower = consumed/kept first):
 * critical → important → unranked → supporting → optional.
 *
 * "unranked" (absent tier, legacy producers) sits between important and
 * supporting: it is genuine selected context, but explicit tier knowledge
 * outranks it and explicit non-essentials yield to it.
 */
export const TIER_PRIORITY: Readonly<Record<ContextTier | "unranked", number>> = {
  critical: 0,
  important: 1,
  unranked: 2,
  supporting: 3,
  optional: 4,
};

/** The budget priority of an item's tier (`"unranked"` when absent). */
export function tierPriorityOf(tier: ContextTier | undefined): number {
  return TIER_PRIORITY[tier ?? "unranked"];
}

/** Minimal symbol shape needed to build an outline (core `Symbol` works). */
export interface OutlineSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly parentId: string | null;
  readonly location: { readonly startLine: number; readonly endLine: number };
}

/**
 * Build an indented symbol outline from a flat symbol list.
 *
 * Deterministic: children are ordered by start line. Roots are top-level
 * symbols (no parent or a parent not in the list). Each line is
 * `<indent>- <name> (<kind>) L<start>-<end>`.
 */
export function buildSymbolOutline(symbols: readonly OutlineSymbol[]): string {
  const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const childrenOf = new Map<string, OutlineSymbol[]>();
  const roots: OutlineSymbol[] = [];
  const sorted = [...symbols].sort((a, b) => a.location.startLine - b.location.startLine);
  for (const symbol of sorted) {
    const parent = symbol.parentId !== null ? byId.get(symbol.parentId) : undefined;
    if (parent === undefined) {
      roots.push(symbol);
    } else {
      const list = childrenOf.get(parent.id) ?? [];
      list.push(symbol);
      childrenOf.set(parent.id, list);
    }
  }
  const lines: string[] = [];
  const visit = (symbol: OutlineSymbol, depth: number): void => {
    const indent = "  ".repeat(depth);
    lines.push(
      `${indent}- ${symbol.name} (${symbol.kind}) ` +
        `L${symbol.location.startLine}-${symbol.location.endLine}`,
    );
    for (const child of childrenOf.get(symbol.id) ?? []) {
      visit(child, depth + 1);
    }
  };
  for (const root of roots) {
    visit(root, 0);
  }
  return lines.join("\n");
}

/** The full-content line range of a symbol location. */
export function lineRangeOfSymbol(location: {
  readonly startLine: number;
  readonly endLine: number;
}): LineRange {
  return { startLine: location.startLine, endLine: location.endLine };
}

/**
 * Extract 1-based inclusive line ranges from file content.
 *
 * Deterministic; ranges are emitted in the given order, each block headed by
 * `@@ L<start>-<end> @@` so a model can cite exactly what it read. Out-of-range
 * lines are clamped; empty results yield an empty string.
 */
export function sliceContentByRanges(content: string, ranges: readonly LineRange[]): string {
  const lines = content.split("\n");
  const blocks: string[] = [];
  for (const range of ranges) {
    const start = Math.max(1, Math.min(range.startLine, lines.length));
    const end = Math.max(start, Math.min(range.endLine, lines.length));
    if (lines.length === 0 || range.endLine < 1 || range.startLine > lines.length) {
      continue;
    }
    const body = lines.slice(start - 1, end).join("\n");
    blocks.push(`@@ L${start}-${end} @@\n${body}`);
  }
  return blocks.join("\n\n");
}
