import { describe, expect, it } from "vitest";
import { DEFAULT_IGNORED_DIRECTORIES, createIgnoreMatcher } from "../src/ignore";

describe("ignore rules", () => {
  it("ignores every default directory", () => {
    const ignore = createIgnoreMatcher();
    for (const name of DEFAULT_IGNORED_DIRECTORIES) {
      expect(ignore(name)).toBe(true);
    }
    expect(ignore("src")).toBe(false);
    expect(ignore("index.ts")).toBe(false);
  });

  it("matches case-insensitively", () => {
    const ignore = createIgnoreMatcher();
    expect(ignore("Node_Modules")).toBe(true);
    expect(ignore("DIST")).toBe(true);
    expect(ignore("Vendor")).toBe(true);
  });

  it("honors a custom ignore list", () => {
    const ignore = createIgnoreMatcher(["tmp", "logs"]);
    expect(ignore("tmp")).toBe(true);
    expect(ignore("logs")).toBe(true);
    expect(ignore("node_modules")).toBe(false);
  });
});
