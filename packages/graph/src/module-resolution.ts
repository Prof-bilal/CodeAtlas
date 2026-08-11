import { dirname } from "node:path";
import type { Symbol } from "@atlas/core";
import type { FilePath } from "@atlas/shared";

/**
 * Resolve a relative module specifier (e.g. `"./utils"`) against a source file
 * into a file that is part of the indexed corpus, or `undefined` when the
 * specifier does not match any known file.
 *
 * Only `./` / `../` specifiers are resolved; bare and `node:` specifiers are
 * not locally indexed. Candidates are tried in order: the resolved path, then
 * `.ts`, `.tsx`, `/index.ts`, `/index.tsx`. `knownFiles` maps forward-slash
 * normalized paths to the original {@link FilePath}s.
 *
 * This mirrors the resolver inside `@atlas/parser`'s `SymbolIndexer`; it is
 * duplicated here so `@atlas/graph` stays decoupled from the parser (both may
 * only import `core` and `shared`). Keep the two in sync.
 */
export function resolveModulePath(
  fromFile: FilePath,
  specifier: string,
  knownFiles: ReadonlyMap<string, FilePath>,
): FilePath | undefined {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return undefined;
  }
  const resolved = resolveRelativePath(fromFile, specifier);
  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}/index.ts`,
    `${resolved}/index.tsx`,
  ];
  for (const candidate of candidates) {
    const original = knownFiles.get(candidate);
    if (original !== undefined) {
      return original;
    }
  }
  return undefined;
}

/**
 * The exported symbols in the imported module that match an import binding.
 *
 * Match rule (mirrors the parser indexer): the definition is exported, has the
 * same name as the import binding, and — for default imports — carries a
 * `"default"` modifier.
 *
 * Known gaps inherited from the parser: renamed imports (`import { a as b }`
 * bind `b`, which never matches the exported `a`) and `export default <expr>`
 * (whose export symbol is named `"default"`) do not resolve.
 */
export function definitionsForImport(
  importSymbol: Symbol,
  symbols: readonly Symbol[],
  knownFiles: ReadonlyMap<string, FilePath>,
): readonly Symbol[] {
  const specifier = importSymbol.moduleSpecifier;
  if (specifier === null) {
    return [];
  }
  const targetFile = resolveModulePath(importSymbol.filePath, specifier, knownFiles);
  if (targetFile === undefined) {
    return [];
  }
  const isDefault = importSymbol.modifiers.includes("default");
  return symbols.filter(
    (symbol) =>
      symbol.filePath === targetFile &&
      symbol.exported &&
      symbol.name === importSymbol.name &&
      (!isDefault || symbol.modifiers.includes("default")),
  );
}

/**
 * Collapse a relative specifier against a source file into a forward-slash path
 * with `.` and `..` segments removed. Cross-platform: Windows separators are
 * normalized to `/`.
 */
function resolveRelativePath(fromFile: string, specifier: string): string {
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
