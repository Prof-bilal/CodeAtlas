import type { FilePath } from "@prof-bilal/atlas-shared";
import { describe, expect, it } from "vitest";
import { firstKnownFile } from "../src/treesitter/resolvers/module-resolver";
import { CSHARP_RESOLVER } from "../src/treesitter/resolvers/csharp";
import { GO_RESOLVER } from "../src/treesitter/resolvers/go";
import { JAVA_RESOLVER } from "../src/treesitter/resolvers/java";
import { PYTHON_RESOLVER } from "../src/treesitter/resolvers/python";
import { RUST_RESOLVER } from "../src/treesitter/resolvers/rust";
import { TYPESCRIPT_RESOLVER } from "../src/treesitter/resolvers/typescript";

function known(files: readonly string[]): ReadonlyMap<string, FilePath> {
  return new Map(files.map((file) => [file, file as FilePath]));
}

describe("module resolvers", () => {
  it("TypeScript resolves relative specifiers and .js→.ts mappings", () => {
    const files = known(["/repo/src/utils.ts", "/repo/src/sub/index.ts", "/repo/src/app.js"]);
    const from = "/repo/src/main.ts" as FilePath;
    expect(TYPESCRIPT_RESOLVER.resolve(from, "./utils", files)).toBe("/repo/src/utils.ts");
    expect(TYPESCRIPT_RESOLVER.resolve(from, "./only-ts.js", files)).toBeUndefined();
    expect(TYPESCRIPT_RESOLVER.resolve("/repo/src/x.ts" as FilePath, "./app.js", files)).toBe(
      "/repo/src/app.js",
    );
    expect(TYPESCRIPT_RESOLVER.resolve(from, "lodash", files)).toBeUndefined();
  });

  it("Python resolves relative, dotted, and package __init__ specifiers", () => {
    const files = known([
      "/repo/pkg/utils.py",
      "/repo/pkg/__init__.py",
      "/repo/pkg/sub/mod.py",
      "/repo/src/api/handlers.py",
    ]);
    const from = "/repo/pkg/sub/main.py" as FilePath;
    expect(PYTHON_RESOLVER.resolve(from, ".mod", files)).toBe("/repo/pkg/sub/mod.py");
    expect(PYTHON_RESOLVER.resolve("/repo/pkg/app.py" as FilePath, ".utils", files)).toBe(
      "/repo/pkg/utils.py",
    );
    expect(PYTHON_RESOLVER.resolve("/repo/pkg/app.py" as FilePath, ".", files)).toBe(
      "/repo/pkg/__init__.py",
    );
    expect(PYTHON_RESOLVER.resolve("/repo/pkg/app.py" as FilePath, "pkg.utils", files)).toBe(
      "/repo/pkg/utils.py",
    );
    // `src/` layout: dotted path matches anywhere under the repo.
    expect(PYTHON_RESOLVER.resolve("/repo/main.py" as FilePath, "src.api.handlers", files)).toBe(
      "/repo/src/api/handlers.py",
    );
  });

  it("Go resolves by package directory name", () => {
    const files = known(["/repo/internal/util/util.go", "/repo/main.go", "/repo/README.md"]);
    const from = "/repo/main.go" as FilePath;
    expect(GO_RESOLVER.resolve(from, "example.com/mod/internal/util", files)).toBe(
      "/repo/internal/util/util.go",
    );
    expect(GO_RESOLVER.resolve(from, "fmt", files)).toBeUndefined();
  });

  it("Java resolves dotted class paths and wildcard packages", () => {
    const files = known(["/repo/src/com/example/Foo.java", "/repo/src/com/example/Svc.java"]);
    const from = "/repo/src/com/example/Main.java" as FilePath;
    expect(JAVA_RESOLVER.resolve(from, "com.example.Foo", files)).toBe(
      "/repo/src/com/example/Foo.java",
    );
    expect(JAVA_RESOLVER.resolve(from, "com.example.Foo.Nested", files)).toBe(
      "/repo/src/com/example/Foo.java",
    );
    expect(JAVA_RESOLVER.resolve(from, "com.example.*", files)).toBe(
      "/repo/src/com/example/Foo.java",
    );
  });

  it("C# resolves namespaces by path segment", () => {
    const files = known(["/repo/Demo/Service.cs", "/repo/Other.cs"]);
    const from = "/repo/Other.cs" as FilePath;
    expect(CSHARP_RESOLVER.resolve(from, "Demo", files)).toBe("/repo/Demo/Service.cs");
  });

  it("Rust resolves crate, self, and plain module paths", () => {
    const files = known(["/repo/src/util.rs", "/repo/src/lib.rs", "/repo/src/a/mod.rs"]);
    expect(RUST_RESOLVER.resolve("/repo/src/lib.rs" as FilePath, "crate::util", files)).toBe(
      "/repo/src/util.rs",
    );
    expect(RUST_RESOLVER.resolve("/repo/src/lib.rs" as FilePath, "self::util", files)).toBe(
      "/repo/src/util.rs",
    );
    expect(RUST_RESOLVER.resolve("/repo/src/lib.rs" as FilePath, "a", files)).toBe(
      "/repo/src/a/mod.rs",
    );
  });

  it("firstKnownFile returns the first candidate present", () => {
    const files = known(["/repo/a.ts", "/repo/b.ts"]);
    expect(firstKnownFile(["/repo/b.ts", "/repo/a.ts"], files)).toBe("/repo/b.ts");
    expect(firstKnownFile(["/repo/c.ts"], files)).toBeUndefined();
  });
});
