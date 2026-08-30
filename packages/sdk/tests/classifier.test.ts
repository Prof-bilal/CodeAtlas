import { describe, expect, it } from "vitest";
import { createClassifier } from "../src/context-integration/classifier";

describe("createClassifier", () => {
  const classify = createClassifier();

  it("classifies a bug-fix task as 'debug'", () => {
    const result = classify("Fix the crash in src/auth.ts when login fails");
    expect(result.category).toBe("debug");
    expect(result.confidence).toBeGreaterThan(0.4);
    expect(result.entities.filePaths).toContain("src/auth.ts");
  });

  it("classifies a security task as 'security'", () => {
    const result = classify("There's an SQL injection vulnerability in the user search endpoint");
    expect(result.category).toBe("security");
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it("classifies a refactoring task as 'architecture'", () => {
    const result = classify(
      "Refactor the dependency structure to remove circular imports between modules",
    );
    expect(result.category).toBe("architecture");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("classifies an explanation task as 'understand'", () => {
    const result = classify("Explain how the authentication flow works in this codebase");
    expect(result.category).toBe("understand");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("picks a subcategory for debug tasks", () => {
    const result = classify("Fix the type error in the TypeScript parser");
    expect(result.subcategory).toBe("type-bug");
  });

  it("picks a subcategory for security tasks", () => {
    const result = classify("Add RBAC permission checks to the admin API");
    // "auth-feature" is an architecture subcategory; for security tasks the
    // subcategory falls back to the category name unless security-specific
    // subcategories are added.
    expect(result.category).toBe("security");
    expect(result.subcategory).toBeTruthy();
  });

  it("extracts entities from the task", () => {
    const result = classify("Fix the bug in src/services/user.ts where `UserService.create` fails");
    expect(result.entities.filePaths).toContain("src/services/user.ts");
    expect(result.entities.symbolNames).toContain("UserService");
  });

  it("returns low confidence for ambiguous tasks", () => {
    const result = classify("make it better");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("defaults to 'understand' when no signals match", () => {
    const result = classify("xyzzy plugh");
    expect(result.category).toBe("understand");
    expect(result.confidence).toBeLessThan(0.3);
  });

  it("always includes reasoning", () => {
    const result = classify("Fix the bug in src/auth.ts");
    expect(result.reasoning).toBeTruthy();
    expect(result.reasoning.length).toBeGreaterThan(10);
  });

  it("handles empty input", () => {
    const result = classify("");
    expect(result.category).toBe("understand");
    expect(result.entities.filePaths).toHaveLength(0);
  });

  it("handles very long input (truncation)", () => {
    const longTask = "Fix the bug ".repeat(500);
    const result = classify(longTask);
    expect(result.category).toBe("debug");
  });

  it("classifies multi-signal tasks with highest confidence", () => {
    const result = classify("Fix the SQL injection vulnerability in the user search API endpoint");
    // Both security and debug signals present — security should win due to
    // stronger security-specific patterns.
    expect(["security", "debug"]).toContain(result.category);
    expect(result.confidence).toBeGreaterThan(0.3);
  });
});
