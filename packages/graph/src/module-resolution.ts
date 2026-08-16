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
 * Match rule (mirrors the parser indexer): named imports match by the name
 * used **in the module** — for renamed imports (`import { a as b }`) that is
 * `importedName` (`"a"`), not the local alias (`"b"`). Default imports resolve
 * to the module's default export: any exported symbol carrying a `"default"`
 * modifier, or the `export default <expr>` assignment symbol named `"default"`.
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
  return lookupExport(importSymbol, targetFile, buildExportIndex(symbols));
}

/**
 * Index exported symbols by `filePath → name → symbols` so per-import lookup is
 * O(1) instead of a full `symbols.filter` scan per import. Building the index
 * once over N symbols costs O(N); with M import bindings the previous
 * implementation cost O(M × N), which dominates graph build time at repository
 * scale.
 */
export function buildExportIndex(
  symbols: readonly Symbol[],
): ReadonlyMap<string, ReadonlyMap<string, readonly Symbol[]>> {
  const byFile = new Map<string, Map<string, Symbol[]>>();
  for (const symbol of symbols) {
    if (!symbol.exported) {
      continue;
    }
    let byName = byFile.get(symbol.filePath);
    if (byName === undefined) {
      byName = new Map();
      byFile.set(symbol.filePath, byName);
    }
    const list = byName.get(symbol.name);
    if (list === undefined) {
      byName.set(symbol.name, [symbol]);
    } else {
      list.push(symbol);
    }
  }
  return byFile;
}

/** Look up an import binding's exported definitions in the target file. */
function lookupExport(
  importSymbol: Symbol,
  targetFile: FilePath,
  byFile: ReadonlyMap<string, ReadonlyMap<string, readonly Symbol[]>>,
): readonly Symbol[] {
  const byName = byFile.get(targetFile);
  if (byName === undefined) {
    return [];
  }
  const isDefault = importSymbol.modifiers.includes("default");
  if (isDefault) {
    // `export default function/class/…` symbols carry a "default" modifier;
    // the `export default <expr>` assignment symbol is itself named "default".
    return [...byName.values()]
      .flat()
      .filter((symbol) => symbol.modifiers.includes("default") || symbol.name === "default");
  }
  const importedName = importSymbol.importedName ?? importSymbol.name;
  return byName.get(importedName) ?? [];
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
