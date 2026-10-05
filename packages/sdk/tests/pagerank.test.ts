import { describe, expect, it } from "vitest";
import { computePageRank } from "../src/context/pagerank";

describe("computePageRank", () => {
  it("ranks a referenced node above nodes with no incoming edges", () => {
    const ranks = computePageRank([
      { from: "a", to: "b" },
      { from: "c", to: "b" },
    ]);
    expect(ranks.get("b")).toBeGreaterThan(ranks.get("a") ?? 0);
    expect(ranks.get("b")).toBeGreaterThan(ranks.get("c") ?? 0);
  });

  it("is deterministic for the same input", () => {
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    expect([...computePageRank(edges).entries()]).toEqual([...computePageRank(edges).entries()]);
  });

  it("returns an empty map with no edges", () => {
    expect(computePageRank([]).size).toBe(0);
  });
});
