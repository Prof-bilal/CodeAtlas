import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_BUDGET, applyBudget } from "../src/context-integration/budget";
import type { ContextPackage, ContextPackageItem } from "../src/context-integration/models";
import { renderContextPackage } from "../src/context-integration/render";

function item(id: string, overrides: Partial<ContextPackageItem> = {}): ContextPackageItem {
  return {
    id,
    kind: "file",
    title: id,
    path: `${id}.ts`,
    content: `content of ${id}`,
    score: 1,
    source: "search",
    reason: "test",
    truncated: false,
    tokens: 10,
    ...overrides,
  };
}

const budget = { ...DEFAULT_CONTEXT_BUDGET, maxItems: 3, maxTokensTotal: 1000 };

describe("tier-first budget consumption (P1.5)", () => {
  it("drops optional/supporting before important/critical on the item cap", () => {
    const items = [
      item("critical-1", { tier: "critical" }),
      item("important-1", { tier: "important" }),
      item("supporting-1", { tier: "supporting" }),
      item("optional-1", { tier: "optional" }),
    ];
    // Items arrive rank-ordered as the assembler produces them (tier-sorted).
    const ordered = [items[0], items[1], items[2], items[3]];
    const { items: kept, record } = applyBudget(ordered, budget);
    expect(kept.map((entry) => entry.id)).toEqual(["critical-1", "important-1", "supporting-1"]);
    expect(record.itemsDroppedByCount).toEqual(["optional-1"]);
  });

  it("never drops a critical-tier item even when the input order is unfavorable", () => {
    const items = [
      item("a-supporting", { tier: "supporting" }),
      item("b-supporting", { tier: "supporting" }),
      item("c-critical", { tier: "critical" }),
      item("d-supporting", { tier: "supporting" }),
    ];
    const { items: kept } = applyBudget(items, budget);
    expect(kept.map((entry) => entry.id)).toContain("c-critical");
    expect(kept.length).toBeLessThanOrEqual(3);
    // The critical item survives even though it sits past the cap position.
    const dropped = items
      .map((entry) => entry.id)
      .filter((id) => !kept.some((entry) => entry.id === id));
    expect(dropped).not.toContain("c-critical");
  });

  it("drops unranked items after important ones (absent tier = unranked)", () => {
    const items = [
      item("important-1", { tier: "important" }),
      item("unranked-1"),
      item("optional-1", { tier: "optional" }),
      item("another-unranked"),
    ];
    const { items: kept, record } = applyBudget(items, budget);
    expect(kept.map((entry) => entry.id)).toContain("important-1");
    expect(record.itemsDroppedByCount).toContain("another-unranked");
  });
});

describe("tiered render (snapshot-style)", () => {
  it("renders tier and line-range annotations in reading order", () => {
    const pkg: ContextPackage = {
      task: "fix the login bug",
      staleness: {
        state: "fresh",
        available: true,
        lastUpdated: "2026-08-30T00:00:00.000Z",
        changed: [],
        added: [],
        deleted: [],
      },
      budget: {
        budget: DEFAULT_CONTEXT_BUDGET,
        itemsRequested: 2,
        itemsIncluded: 2,
        tokensEstimated: 20,
        itemsDroppedByCount: [],
        itemsTruncated: [],
        droppedByTokens: [],
        budgetExceeded: false,
      },
      exclusions: { droppedPaths: [], droppedPatterns: [] },
      truncated: false,
      items: [
        item("critical-file", {
          tier: "critical",
          source: "explicit",
          reason: "Task names file directly.",
        }),
        item("symbol", {
          kind: "symbol",
          title: "authenticate",
          path: "src/auth.ts",
          tier: "critical",
          ranges: [{ startLine: 12, endLine: 30 }],
          reason: "Task names symbol directly.",
        }),
      ],
    };
    const rendered = renderContextPackage(pkg);
    const lines = rendered.split("\n");
    // Critical item appears before the symbol item (tier-major reading order).
    expect(lines.indexOf("## critical-file")).toBeLessThan(lines.indexOf("## authenticate"));
    // Compact annotation carries reason + tier + ranges on one line.
    expect(rendered).toContain("> Task names file directly. · tier: critical");
    expect(rendered).toContain("> Task names symbol directly. · tier: critical · lines: 12-30");
    // The unranked/explanation path still renders items without tier cleanly.
    const noTier = renderContextPackage({
      ...pkg,
      items: [item("plain")],
    });
    expect(noTier).toContain("> test");
    expect(noTier).not.toContain("tier:");
  });
});
