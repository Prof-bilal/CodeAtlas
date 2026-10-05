import type { ModuleResolver } from "@prof-bilal/atlas-core";
import type { FilePath } from "@prof-bilal/atlas-shared";
import { dirname } from "node:path";
import { CSHARP_RESOLVER } from "./csharp";
import { GO_RESOLVER } from "./go";
import { JAVA_RESOLVER } from "./java";
import { PYTHON_RESOLVER } from "./python";
import { RUST_RESOLVER } from "./rust";
import { TYPESCRIPT_RESOLVER } from "./typescript";

/**
 * Tries module resolvers in order and returns the first match. Because a file's
 * language is not carried on its symbols, the graph tries every resolver; each
 * resolver is conservative (only its own specifier shapes/exensions), so a TS
 * `"./util"` never matches the Python resolver's `.py` candidates.
 */
export class ModuleResolverRegistry implements ModuleResolver {
  public readonly id = "registry";

  public constructor(private readonly resolvers: readonly ModuleResolver[]) {}

  public resolve(
    fromFile: FilePath,
    specifier: string,
    knownFiles: ReadonlyMap<string, FilePath>,
  ): FilePath | undefined {
    for (const resolver of this.resolvers) {
      const resolved = resolver.resolve(fromFile, specifier, knownFiles);
      if (resolved !== undefined) {
        return resolved;
      }
    }
    return undefined;
  }
}

/** The default resolver set: TypeScript/JavaScript, Python, Go, Java, C#, Rust. */
export function createDefaultModuleResolvers(): readonly ModuleResolver[] {
  return [
    TYPESCRIPT_RESOLVER,
    PYTHON_RESOLVER,
    GO_RESOLVER,
    JAVA_RESOLVER,
    CSHARP_RESOLVER,
    RUST_RESOLVER,
  ];
}

/** A ready-to-inject registry of the default resolvers. */
export function createDefaultModuleResolverRegistry(): ModuleResolverRegistry {
  return new ModuleResolverRegistry(createDefaultModuleResolvers());
}

/**
 * Collapse a relative specifier against a source file into a forward-slash path
 * with `.`/`..` segments removed (Windows separators normalized).
 */
export function resolveRelativePath(fromFile: string, specifier: string): string {
  const base = dirname(fromFile).replace(/\\/g, "/");
  const leadingSlash = base.startsWith("/") ? "/" : "";
  const stack: string[] = [];
  for (const part of [...base.split("/"), ...specifier.split("/")]) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return leadingSlash + stack.join("/");
}

/** Try each candidate path against the corpus, returning the first hit. */
export function firstKnownFile(
  candidates: readonly string[],
  knownFiles: ReadonlyMap<string, FilePath>,
): FilePath | undefined {
  for (const candidate of candidates) {
    const original = knownFiles.get(candidate);
    if (original !== undefined) {
      return original;
    }
  }
  return undefined;
}

/** Every known file whose normalized path ends with `suffix` (first wins). */
export function findFileEndingWith(
  suffix: string,
  knownFiles: ReadonlyMap<string, FilePath>,
): FilePath | undefined {
  for (const [normalized, original] of knownFiles) {
    if (normalized.endsWith(suffix)) {
      return original;
    }
  }
  return undefined;
}

/** Every known file whose normalized path contains `segment` (first wins). */
export function findFileIncluding(
  segment: string,
  knownFiles: ReadonlyMap<string, FilePath>,
): FilePath | undefined {
  for (const [normalized, original] of knownFiles) {
    if (normalized.includes(segment)) {
      return original;
    }
  }
  return undefined;
}
