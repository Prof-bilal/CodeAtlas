import type { ModuleResolver } from "@prof-bilal/atlas-core";
import type { FilePath } from "@prof-bilal/atlas-shared";
import { findFileEndingWith, findFileIncluding } from "./module-resolver";

/**
 * Java import resolver: `a.b.C` → `**\/a/b/C.java`. Nested classes
 * (`a.b.Outer.Inner`) are resolved by dropping trailing segments until a file
 * matches. `a.b.*` matches any `.java` file under the `a/b/` package directory.
 * Best-effort source-layout heuristic — no build-system awareness.
 */
export const JAVA_RESOLVER: ModuleResolver = {
  id: "java",
  resolve(_fromFile: FilePath, specifier: string, knownFiles: ReadonlyMap<string, FilePath>) {
    const cleaned = specifier.replace(/;\s*$/, "").trim();
    if (cleaned.length === 0) {
      return undefined;
    }
    if (cleaned.endsWith(".*")) {
      const dir = `/${cleaned.slice(0, -2).replace(/\./g, "/")}/`;
      return findFileIncluding(dir, onlyWith(knownFiles, ".java"));
    }
    const parts = cleaned.split(".");
    for (let take = parts.length; take >= 1; take -= 1) {
      const hit = findFileEndingWith(
        `/${parts.slice(0, take).join("/")}.java`,
        onlyWith(knownFiles, ".java"),
      );
      if (hit !== undefined) {
        return hit;
      }
    }
    return undefined;
  },
};

/** A view of `knownFiles` restricted to a single extension. */
function onlyWith(
  knownFiles: ReadonlyMap<string, FilePath>,
  extension: string,
): ReadonlyMap<string, FilePath> {
  const filtered = new Map<string, FilePath>();
  for (const [normalized, original] of knownFiles) {
    if (normalized.endsWith(extension)) {
      filtered.set(normalized, original);
    }
  }
  return filtered;
}
