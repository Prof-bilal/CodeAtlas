import type { ModuleResolver } from "@prof-bilal/atlas-core";
import type { FilePath } from "@prof-bilal/atlas-shared";
import { dirname } from "node:path";
import { findFileEndingWith, firstKnownFile } from "./module-resolver";

/** `a::b` → candidate `.rs` / `mod.rs` suffixes for a module path. */
function moduleCandidates(prefix: string, modulePath: string): string[] {
  const base = modulePath.replace(/::/g, "/");
  return [`${prefix}${base}.rs`, `${prefix}${base}/mod.rs`];
}

/**
 * Rust import resolver for `use` paths: `crate::`, `self::`, `super::`, and
 * plain 2018-edition paths → module files (`x.rs` or `x/mod.rs`). Best-effort
 * source-layout heuristic — no crate-manifest awareness.
 */
export const RUST_RESOLVER: ModuleResolver = {
  id: "rust",
  resolve(fromFile: FilePath, rawSpecifier: string, knownFiles: ReadonlyMap<string, FilePath>) {
    // Drop grouped imports: `use a::b::{c, d}` → `a::b`.
    const grouped = rawSpecifier.indexOf("::{");
    let specifier = (grouped === -1 ? rawSpecifier : rawSpecifier.slice(0, grouped)).trim();
    if (specifier.length === 0) {
      return undefined;
    }
    // `use a::b as c` → `a::b`.
    const asIndex = specifier.indexOf(" as ");
    if (asIndex !== -1) {
      specifier = specifier.slice(0, asIndex).trim();
    }

    const fromDir = dirname(fromFile).replace(/\\/g, "/");

    if (specifier.startsWith("crate::")) {
      const base = specifier.slice("crate::".length).replace(/::/g, "/");
      return (
        findFileEndingWith(`/${base}.rs`, knownFiles) ??
        findFileEndingWith(`/${base}/mod.rs`, knownFiles)
      );
    }
    if (specifier.startsWith("self::")) {
      return firstKnownFile(
        moduleCandidates(`${fromDir}/`, specifier.slice("self::".length)),
        knownFiles,
      );
    }
    if (specifier.startsWith("super::")) {
      let base = fromDir;
      let rest = specifier;
      while (rest.startsWith("super::")) {
        rest = rest.slice("super::".length);
        const slash = base.lastIndexOf("/");
        base = slash <= 0 ? "" : base.slice(0, slash);
      }
      return firstKnownFile(moduleCandidates(`${base}/`, rest), knownFiles);
    }
    return (
      firstKnownFile(moduleCandidates(`${fromDir}/`, specifier), knownFiles) ??
      findFileEndingWith(`/${specifier.replace(/::/g, "/")}.rs`, knownFiles) ??
      findFileEndingWith(`/${specifier.replace(/::/g, "/")}/mod.rs`, knownFiles)
    );
  },
};
