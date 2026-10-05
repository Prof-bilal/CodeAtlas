import type { ModuleResolver } from "@prof-bilal/atlas-core";
import type { FilePath } from "@prof-bilal/atlas-shared";
import { dirname } from "node:path";
import { findFileEndingWith, firstKnownFile } from "./module-resolver";

/** The package directory for a `from .` import with `level` leading dots. */
function relativeBase(fromFile: string, level: number): string {
  let base = dirname(fromFile).replace(/\\/g, "/");
  // One dot = the file's own package (its directory); each extra dot goes up.
  for (let index = 1; index < level; index += 1) {
    const slash = base.lastIndexOf("/");
    base = slash <= 0 ? "" : base.slice(0, slash);
  }
  return base;
}

/**
 * Python import resolver: relative (`from .a.b import x`) and dotted absolute
 * (`import a.b`) specifiers. Dotted paths map to `a/b.py` or `a/b/__init__.py`,
 * matched anywhere under the repository (supports `src/` layouts).
 */
export const PYTHON_RESOLVER: ModuleResolver = {
  id: "python",
  resolve(fromFile: FilePath, specifier: string, knownFiles: ReadonlyMap<string, FilePath>) {
    if (specifier.length === 0) {
      return undefined;
    }
    if (specifier.startsWith(".")) {
      const level = specifier.length - specifier.replace(/^\.+/, "").length;
      const rest = specifier.slice(level).replace(/\./g, "/");
      const base = relativeBase(fromFile, level);
      const candidates =
        rest === ""
          ? [`${base}/__init__.py`]
          : [`${base}/${rest}.py`, `${base}/${rest}/__init__.py`];
      return firstKnownFile(candidates, knownFiles);
    }
    const path = specifier.replace(/\./g, "/");
    return (
      findFileEndingWith(`/${path}.py`, knownFiles) ??
      findFileEndingWith(`/${path}/__init__.py`, knownFiles)
    );
  },
};
