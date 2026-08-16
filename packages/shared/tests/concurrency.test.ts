import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../src/types/concurrency";

describe("mapWithConcurrency", () => {
  it("maps all items and preserves input order", async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 2);
    expect(result).toEqual([2, 4, 6, 8]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(result).toHaveLength(8);
  });

  it("handles an empty input", async () => {
    const result = await mapWithConcurrency([], 4, async () => 1);
    expect(result).toEqual([]);
  });

  it("propagates a rejection", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) {
          throw new Error("boom");
        }
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
