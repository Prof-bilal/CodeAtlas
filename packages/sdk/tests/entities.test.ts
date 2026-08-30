import { describe, expect, it } from "vitest";
import { extractTaskEntities } from "../src/context-integration/entities";

describe("extractTaskEntities", () => {
  it("extracts file paths, symbols, and keywords from a task", () => {
    const entities = extractTaskEntities(
      "Fix the bug in src/services/taskService.ts where `TaskService.create` ignores status validation",
    );
    expect(entities.filePaths).toContain("src/services/taskService.ts");
    expect(entities.symbolNames).toContain("taskService");
    expect(entities.keywords).toContain("validation");
  });

  it("recognizes bare file names only for known code extensions", () => {
    const entities = extractTaskEntities("update README.md and config.json");
    expect(entities.filePaths).toContain("README.md");
    expect(entities.filePaths).toContain("config.json");
    expect(extractTaskEntities("open the notes.unknownext").filePaths).toHaveLength(0);
  });

  it("extracts camelCase and snake_case symbol candidates", () => {
    const entities = extractTaskEntities("rename fetchUserData and user_created_at handling");
    expect(entities.symbolNames).toContain("fetchUserData");
    expect(entities.symbolNames).toContain("user_created_at");
  });

  it("extracts backticked and quoted names", () => {
    const entities = extractTaskEntities("check `authenticate` and 'PaymentGateway'");
    expect(entities.symbolNames).toContain("authenticate");
    expect(entities.symbolNames).toContain("PaymentGateway");
  });

  it("normalizes windows-style path separators", () => {
    const entities = extractTaskEntities("look at src\\services\\auth.ts");
    expect(entities.filePaths).toContain("src/services/auth.ts");
  });

  it("dedupes case-insensitive symbol candidates", () => {
    const entities = extractTaskEntities("TaskService and taskservice and `TaskService`");
    const lower = entities.symbolNames.map((s) => s.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("excludes .env files from retrieval targets", () => {
    const entities = extractTaskEntities("why is .env.example loaded by config.ts");
    expect(entities.filePaths).not.toContain(".env.example");
    expect(entities.filePaths).toContain("config.ts");
  });

  it("rejects traversal and absolute paths", () => {
    const entities = extractTaskEntities("read ../../../etc/passwd and /etc/hosts");
    expect(entities.filePaths).toHaveLength(0);
  });

  it("returns empty entities for empty and whitespace input", () => {
    expect(extractTaskEntities("")).toEqual({
      filePaths: [],
      symbolNames: [],
      keywords: [],
    });
    expect(extractTaskEntities("   \n\t  ").keywords).toEqual([]);
  });

  it("survives control characters without throwing", () => {
    const entities = extractTaskEntities("fix auth\u0000.ts \u001B[31merror\u0007");
    expect(Array.isArray(entities.filePaths)).toBe(true);
  });

  it("caps output on adversarially large input", () => {
    const giant = `${"a/b/c.ts ".repeat(5000)}${"SomeSymbol ".repeat(5000)}`;
    const entities = extractTaskEntities(giant);
    expect(entities.filePaths.length).toBeLessThanOrEqual(10);
    expect(entities.symbolNames.length).toBeLessThanOrEqual(15);
    expect(entities.keywords.length).toBeLessThanOrEqual(12);
  });

  it("is deterministic for identical input", () => {
    const task = "refactor PaymentService.calculate using helper_math.ts";
    expect(extractTaskEntities(task)).toEqual(extractTaskEntities(task));
  });
});
