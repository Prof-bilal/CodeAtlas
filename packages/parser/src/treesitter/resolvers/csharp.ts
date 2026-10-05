import type { ModuleResolver } from "@prof-bilal/atlas-core";
import type { FilePath } from "@prof-bilal/atlas-shared";
import { findFileEndingWith, findFileIncluding } from "./module-resolver";

/**
 * C# `using A.B;` resolver. Namespaces are not carried on the resolver input,
 * so this is a source-layout heuristic: try `A/B/….cs`, then any `.cs` file
 * whose path contains the `A/B/` namespace directory, then `<Last>.cs`.
 * Best-effort — no build-system/type awareness.
 */
export const CSHARP_RESOLVER: ModuleResolver = {
  id: "csharp",
  resolve(_fromFile: FilePath, specifier: string, knownFiles: ReadonlyMap<string, FilePath>) {
    const cleaned = specifier.replace(/;\s*$/, "").trim();
    if (cleaned.length === 0) {
      return undefined;
    }
    const csFiles = new Map<string, FilePath>();
    for (const [normalized, original] of knownFiles) {
      if (normalized.endsWith(".cs")) {
        csFiles.set(normalized, original);
      }
    }
    const path = cleaned.replace(/\./g, "/");
    return (
      findFileEndingWith(`/${path}.cs`, csFiles) ??
      findFileIncluding(`/${path}/`, csFiles) ??
      findFileEndingWith(`/${cleaned.split(".").pop() ?? cleaned}.cs`, csFiles)
    );
  },
};
