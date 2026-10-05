import type { ModuleResolver } from "@prof-bilal/atlas-core";
import type { FilePath } from "@prof-bilal/atlas-shared";

/**
 * Go import resolver.
 *
 * Go imports name a package path (`example.com/mod/util`); without the build
 * system we match by the package's directory name: the last path segment
 * (`util`) must be a directory holding a `.go` file. Standard-library paths
 * (`fmt`, `net/http`) match nothing in the corpus and stay unresolved.
 */
export const GO_RESOLVER: ModuleResolver = {
  id: "go",
  resolve(_fromFile: FilePath, specifier: string, knownFiles: ReadonlyMap<string, FilePath>) {
    if (specifier.length === 0 || specifier.includes(":")) {
      return undefined;
    }
    const packageName = specifier.split("/").pop();
    if (packageName === undefined || packageName.length === 0) {
      return undefined;
    }
    for (const [normalized, original] of knownFiles) {
      if (!normalized.endsWith(".go")) {
        continue;
      }
      const slash = normalized.lastIndexOf("/");
      const dir = slash === -1 ? "" : normalized.slice(0, slash);
      const dirName = dir.slice(dir.lastIndexOf("/") + 1);
      if (dirName === packageName) {
        return original;
      }
    }
    return undefined;
  },
};
