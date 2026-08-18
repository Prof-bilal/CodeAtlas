import { describe, expect, it } from "vitest";
import type { CacheKey, EdgeId, FilePath, NodeId, ProjectId, SymbolId } from "../src/types/brand";

describe("branded types", () => {
  it("are structurally compatible with their primitive", () => {
    const path = "/src/index.ts" as FilePath;
    expect(path).toBe("/src/index.ts");
  });

  it("remain distinct at the type level", () => {
    // Assignments like `const p: ProjectId = path` fail to typecheck because
    // FilePath and ProjectId are different brands. At runtime they are strings.
    const id = "proj_1" as ProjectId;
    expect(typeof id).toBe("string");
  });

  it("exposes all brand helpers", () => {
    const brands: Record<string, unknown> = {
      projectId: "p1" as ProjectId,
      filePath: "f1" as FilePath,
      symbolId: "s1" as SymbolId,
      nodeId: "n1" as NodeId,
      edgeId: "e1" as EdgeId,
      cacheKey: "k1" as CacheKey,
    };
    expect(Object.values(brands)).toHaveLength(6);
  });
});
