import { describe, expect, it } from "vitest";
import { fail, isOk, ok } from "../src/types/result";

describe("Result", () => {
  it("ok() builds a successful result", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("fail() builds a failed result with the given error", () => {
    const error = new Error("boom");
    const result = fail(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
  });

  it("isOk() narrows a merged union correctly", () => {
    const value = ok(1);
    const error = fail(new Error("nope"));
    expect(isOk(value)).toBe(true);
    expect(isOk(error)).toBe(false);
  });
});
