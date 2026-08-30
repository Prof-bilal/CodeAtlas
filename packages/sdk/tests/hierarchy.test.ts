import { describe, expect, it } from "vitest";
import {
  type OutlineSymbol,
  TIER_PRIORITY,
  buildSymbolOutline,
  lineRangeOfSymbol,
  sliceContentByRanges,
  tierPriorityOf,
} from "../src/context-integration/hierarchy";

function outlineSymbol(
  id: string,
  name: string,
  startLine: number,
  endLine: number,
  parentId: string | null = null,
): OutlineSymbol {
  return {
    id,
    name,
    kind: "function",
    parentId,
    location: { startLine, endLine },
  };
}

describe("tier priority", () => {
  it("orders critical before important before unranked before supporting before optional", () => {
    expect(TIER_PRIORITY.critical).toBeLessThan(TIER_PRIORITY.important);
    expect(TIER_PRIORITY.important).toBeLessThan(TIER_PRIORITY.unranked);
    expect(TIER_PRIORITY.unranked).toBeLessThan(TIER_PRIORITY.supporting);
    expect(TIER_PRIORITY.supporting).toBeLessThan(TIER_PRIORITY.optional);
  });

  it("treats an absent tier as unranked", () => {
    expect(tierPriorityOf(undefined)).toBe(TIER_PRIORITY.unranked);
  });
});

describe("buildSymbolOutline", () => {
  it("renders a nested, line-ordered outline", () => {
    const outline = buildSymbolOutline([
      outlineSymbol("s-method", "create", 12, 30, "s-class"),
      outlineSymbol("s-class", "TaskService", 10, 60),
      outlineSymbol("s-helper", "helper", 5, 8),
    ]);
    const lines = outline.split("\n");
    expect(lines[0]).toBe("- helper (function) L5-8");
    expect(lines[1]).toBe("- TaskService (function) L10-60");
    expect(lines[2]).toBe("  - create (function) L12-30");
  });

  it("treats a missing parent as a root", () => {
    const outline = buildSymbolOutline([outlineSymbol("s-orphan", "orphan", 1, 2, "s-ghost")]);
    expect(outline).toBe("- orphan (function) L1-2");
  });

  it("returns an empty string for no symbols", () => {
    expect(buildSymbolOutline([])).toBe("");
  });

  it("is deterministic", () => {
    const symbols = [outlineSymbol("b", "B", 20, 30), outlineSymbol("a", "A", 1, 10)];
    expect(buildSymbolOutline(symbols)).toEqual(buildSymbolOutline(symbols));
  });
});

describe("lineRangeOfSymbol", () => {
  it("copies the location bounds", () => {
    expect(lineRangeOfSymbol({ startLine: 3, endLine: 9 })).toEqual({
      startLine: 3,
      endLine: 9,
    });
  });
});

describe("sliceContentByRanges", () => {
  const content = ["l1", "l2", "l3", "l4", "l5"].join("\n");

  it("extracts a 1-based inclusive range with a header", () => {
    expect(sliceContentByRanges(content, [{ startLine: 2, endLine: 4 }])).toBe(
      "@@ L2-4 @@\nl2\nl3\nl4",
    );
  });

  it("joins multiple ranges in order", () => {
    const sliced = sliceContentByRanges(content, [
      { startLine: 1, endLine: 1 },
      { startLine: 5, endLine: 5 },
    ]);
    expect(sliced).toContain("@@ L1-1 @@\nl1");
    expect(sliced).toContain("@@ L5-5 @@\nl5");
  });

  it("clamps out-of-bounds ranges", () => {
    const sliced = sliceContentByRanges(content, [{ startLine: 4, endLine: 99 }]);
    expect(sliced).toBe("@@ L4-5 @@\nl4\nl5");
  });

  it("skips ranges entirely outside the content", () => {
    expect(sliceContentByRanges(content, [{ startLine: 10, endLine: 20 }])).toBe("");
  });

  it("returns an empty string for no ranges", () => {
    expect(sliceContentByRanges(content, [])).toBe("");
  });
});
