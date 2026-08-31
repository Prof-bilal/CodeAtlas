import { describe, expect, it } from "vitest";
import { type DigestInput, buildDigest } from "../src/context-integration/digest";

/** Minimal valid digest input for testing. */
function makeInput(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    manifest: { name: "test-project", languages: ["typescript"], framework: null },
    files: [
      { path: "src/index.ts", language: "typescript" },
      { path: "src/utils.ts", language: "typescript" },
      { path: "src/utils.test.ts", language: "typescript" },
    ],
    symbols: [
      { id: "s1", name: "main", kind: "function", filePath: "src/index.ts" },
      { id: "s2", name: "helper", kind: "function", filePath: "src/utils.ts" },
      { id: "s3", name: "TestSuite", kind: "class", filePath: "src/utils.test.ts" },
    ],
    dependencies: [
      { from: "n:file:src/index.ts", to: "n:file:src/utils.ts", kind: "imports" },
      { from: "n:s1", to: "n:s2", kind: "calls" },
    ],
    modules: [{ path: "src", name: "src" }],
    ...overrides,
  };
}

describe("buildDigest", () => {
  it("returns a Summary with kind 'digest' and empty target", () => {
    const result = buildDigest(makeInput());
    expect(result.kind).toBe("digest");
    expect(result.target).toBe("");
  });

  it("has deterministic metadata (no provider)", () => {
    const result = buildDigest(makeInput());
    expect(result.metadata.provider).toBe("deterministic");
    expect(result.metadata.model).toBe("none");
    expect(result.metadata.prompt).toBeNull();
    expect(result.metadata.cacheHit).toBe(false);
  });

  it("produces stable output for unchanged input", () => {
    const input = makeInput();
    const first = buildDigest(input);
    const second = buildDigest(input);
    expect(first.content.overview).toBe(second.content.overview);
    expect(first.content.keyPoints).toEqual(second.content.keyPoints);
  });

  it("updates when files change", () => {
    const base = makeInput();
    const modified = makeInput({
      files: [...base.files, { path: "src/new-module.ts", language: "typescript" }],
    });
    const baseDigest = buildDigest(base);
    const modDigest = buildDigest(modified);
    // The overview should mention the different file count.
    expect(baseDigest.content.overview).not.toBe(modDigest.content.overview);
  });

  it("includes framework in overview when present", () => {
    const input = makeInput({
      manifest: { name: "my-app", languages: ["typescript"], framework: "react" },
    });
    const result = buildDigest(input);
    expect(result.content.overview).toContain("react");
  });

  it("detects entry points from high in-degree", () => {
    const input = makeInput({
      dependencies: [
        // src/utils.ts is imported by index.ts and has a symbol that is called.
        { from: "n:file:src/index.ts", to: "n:file:src/utils.ts", kind: "imports" },
        { from: "n:s1", to: "n:s2", kind: "calls" },
        { from: "n:s3", to: "n:s2", kind: "calls" },
      ],
    });
    const result = buildDigest(input);
    const entryPoints = result.content.keyPoints.find((p) => p.startsWith("Entry points:"));
    expect(entryPoints).toBeDefined();
    expect(entryPoints).toContain("src/utils.ts");
  });

  it("detects test convention from co-located test files", () => {
    const input = makeInput({
      files: [
        { path: "src/foo.ts", language: "typescript" },
        { path: "src/foo.test.ts", language: "typescript" },
        { path: "src/bar.ts", language: "typescript" },
        { path: "src/bar.test.ts", language: "typescript" },
      ],
    });
    const result = buildDigest(input);
    const testPoint = result.content.keyPoints.find((p) => p.startsWith("Test convention:"));
    expect(testPoint).toBeDefined();
    expect(testPoint).toContain("co-located");
  });

  it("detects test convention from __tests__ directory", () => {
    const input = makeInput({
      files: [
        { path: "src/__tests__/foo.test.ts", language: "typescript" },
        { path: "src/__tests__/bar.test.ts", language: "typescript" },
      ],
    });
    const result = buildDigest(input);
    const testPoint = result.content.keyPoints.find((p) => p.startsWith("Test convention:"));
    expect(testPoint).toBeDefined();
    expect(testPoint).toContain("__tests__");
  });

  it("detects naming convention from symbols", () => {
    const input = makeInput({
      symbols: [
        { id: "s1", name: "UserService", kind: "class", filePath: "src/user.ts" },
        { id: "s2", name: "AuthController", kind: "class", filePath: "src/auth.ts" },
        { id: "s3", name: "createUser", kind: "function", filePath: "src/user.ts" },
        { id: "s4", name: "getUser", kind: "function", filePath: "src/user.ts" },
      ],
    });
    const result = buildDigest(input);
    const namingPoint = result.content.keyPoints.find((p) => p.startsWith("Naming convention:"));
    expect(namingPoint).toBeDefined();
    expect(namingPoint).toContain("PascalCase");
  });

  it("lists modules when present", () => {
    const input = makeInput({
      modules: [
        { path: "packages/core", name: "packages/core" },
        { path: "packages/sdk", name: "packages/sdk" },
      ],
    });
    const result = buildDigest(input);
    const modulePoint = result.content.keyPoints.find((p) => p.startsWith("Modules:"));
    expect(modulePoint).toBeDefined();
    expect(modulePoint).toContain("packages/core");
    expect(modulePoint).toContain("packages/sdk");
  });

  it("omits modules when none exist", () => {
    const input = makeInput({ modules: [] });
    const result = buildDigest(input);
    const modulePoint = result.content.keyPoints.find((p) => p.startsWith("Modules:"));
    expect(modulePoint).toBeUndefined();
  });

  it("omits entry points when no architectural edges exist", () => {
    const input = makeInput({ dependencies: [] });
    const result = buildDigest(input);
    const entryPoint = result.content.keyPoints.find((p) => p.startsWith("Entry points:"));
    expect(entryPoint).toBeUndefined();
  });

  it("omits test convention when no test files exist", () => {
    const input = makeInput({
      files: [
        { path: "src/index.ts", language: "typescript" },
        { path: "src/utils.ts", language: "typescript" },
      ],
    });
    const result = buildDigest(input);
    const testPoint = result.content.keyPoints.find((p) => p.startsWith("Test convention:"));
    expect(testPoint).toBeUndefined();
  });

  it("handles empty input gracefully", () => {
    const input = makeInput({
      files: [],
      symbols: [],
      dependencies: [],
      modules: [],
    });
    const result = buildDigest(input);
    expect(result.kind).toBe("digest");
    expect(result.content.overview).toBeTruthy();
    expect(Array.isArray(result.content.keyPoints)).toBe(true);
  });

  it("detects circular dependencies", () => {
    const input = makeInput({
      dependencies: [
        { from: "n:file:src/a.ts", to: "n:file:src/b.ts", kind: "imports" },
        { from: "n:file:src/b.ts", to: "n:file:src/a.ts", kind: "imports" },
      ],
    });
    const result = buildDigest(input);
    const cyclePoint = result.content.keyPoints.find((p) => p.startsWith("Circular"));
    expect(cyclePoint).toBeDefined();
    expect(cyclePoint).toContain("1 cycle");
  });

  it("detects key exports from high-import files", () => {
    const input = makeInput({
      symbols: [
        { id: "s1", name: "createApp", kind: "function", filePath: "src/index.ts" },
        { id: "s2", name: "AppConfig", kind: "interface", filePath: "src/index.ts" },
      ],
      dependencies: [
        // index.ts is imported by many files.
        { from: "n:file:src/utils.ts", to: "n:file:src/index.ts", kind: "imports" },
        { from: "n:file:src/handler.ts", to: "n:file:src/index.ts", kind: "imports" },
        { from: "n:file:src/middleware.ts", to: "n:file:src/index.ts", kind: "imports" },
      ],
    });
    const result = buildDigest(input);
    const exportPoint = result.content.keyPoints.find((p) => p.startsWith("Key exports:"));
    expect(exportPoint).toBeDefined();
  });
});
