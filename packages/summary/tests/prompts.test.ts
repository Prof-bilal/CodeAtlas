import { describe, expect, it } from "vitest";
import { render, truncateContent } from "../src/prompts";

describe("prompts", () => {
  it("substitutes known placeholders and leaves unknown ones intact", () => {
    const result = render("PRO {path} in {language}", { path: "/a.ts", language: "typescript" });
    expect(result).toBe("PRO /a.ts in typescript");
    const withUnknown = render("Keep {custom}", {});
    expect(withUnknown).toBe("Keep {custom}");
  });

  it("truncates content beyond the maximum", () => {
    const long = "x".repeat(20);
    const result = truncateContent(long, 10);
    expect(result).toBe("xxxxxxxxxx\n… (truncated)");
    expect(truncateContent("short", 100)).toBe("short");
  });
});
