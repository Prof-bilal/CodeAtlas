import { dirname } from "node:path";
// biome-ignore lint/suspicious/noShadowRestrictedNames: domain Symbol type, not the JS global
import type { Reference, Symbol, SymbolKind } from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";
import { SymbolNotIndexedError } from "../errors";
import type { ParsedFile } from "../parsed-file";
import type { IndexedSymbol } from "./indexed-symbol";

/** Optional filters for {@link SymbolIndexer.listSymbols}. */
export interface SymbolListFilter {
  /** Only symbols of these kinds (e.g. `"class"`, `"constant"`). */
  readonly kind?: SymbolKind | readonly SymbolKind[];
  /** Only symbols declared in this file. */
  readonly filePath?: FilePath;
  /** Only exported (or only local) symbols. */
  readonly exported?: boolean;
  /** Only symbols with this exact name. */
  readonly name?: string;
}

/** Options for {@link SymbolIndexer.findSymbol}. */
export interface FindSymbolOptions {
  /** Match name case-sensitively. Defaults to `false` (case-insensitive). */
  readonly matchCase?: boolean;
  /** Match by substring instead of exact name. Defaults to `false`. */
  readonly partial?: boolean;
}

/**
 * A searchable, in-memory index of every symbol in a project.
 *
 * Built from normalized {@link ParsedFile}s produced by the parser, so it works
 * with any language — every future {@link LanguageParser} feeds the same
 * normalized IR. References are resolved with name-based heuristics within a
 * file (member scope, then module scope) and across files through import
 * bindings.
 */
export class SymbolIndexer {
  private readonly symbols = new Map<SymbolId, Symbol>();
  private readonly byName = new Map<string, SymbolId[]>();
  private readonly byNameLower = new Map<string, SymbolId[]>();
  private readonly byFile = new Map<FilePath, SymbolId[]>();
  private readonly children = new Map<SymbolId, SymbolId[]>();
  private readonly files = new Map<FilePath, ParsedFile>();
  private readonly order: SymbolId[] = [];

  /** Forward-slash normalized paths for robust cross-platform module resolution. */
  private readonly normalizedFilePaths = new Set<string>();
  private readonly pathsByNormalized = new Map<string, FilePath>();

  private readonly storedReferences: Reference[] = [];
  private readonly referencesByTarget = new Map<SymbolId, Reference[]>();
  private dirty = false;

  /** Number of symbols in the index. */
  public get size(): number {
    return this.symbols.size;
  }

  /**
   * Index every file in a batch (all files should be indexed before resolving
   * cross-file references).
   */
  public index(files: readonly ParsedFile[]): this {
    for (const file of files) {
      this.addFile(file);
    }
    this.resolve();
    return this;
  }

  /** Index a single parsed file. */
  public addFile(file: ParsedFile): this {
    this.files.set(file.path, file);
    const normalized = file.path.replace(/\\/g, "/");
    this.normalizedFilePaths.add(normalized);
    this.pathsByNormalized.set(normalized, file.path);

    for (const symbol of file.symbols) {
      this.addSymbol(symbol);
    }
    this.storedReferences.push(...file.references);
    this.dirty = true;
    return this;
  }

  /** Re-resolve references against the full indexed corpus. */
  public resolve(): this {
    this.referencesByTarget.clear();
    for (const reference of this.storedReferences) {
      for (const target of this.resolveTargets(reference)) {
        const list = this.referencesByTarget.get(target);
        if (list === undefined) {
          this.referencesByTarget.set(target, [reference]);
        } else {
          list.push(reference);
        }
      }
    }
    this.dirty = false;
    return this;
  }

  /** Find the symbol with this id, or `undefined`. */
  public getSymbol(id: SymbolId): IndexedSymbol | undefined {
    this.ensureResolved();
    return this.symbols.has(id) ? this.toIndexed(id) : undefined;
  }

  /**
   * Find every symbol whose name matches `name`. Case-insensitive exact match
   * by default; use {@link FindSymbolOptions} for case-sensitive or partial
   * matching.
   */
  public findSymbol(name: string, options: FindSymbolOptions = {}): IndexedSymbol[] {
    this.ensureResolved();
    const matchCase = options.matchCase ?? false;
    const map = matchCase ? this.byName : this.byNameLower;
    const key = matchCase ? name : name.toLowerCase();

    if (options.partial === true) {
      const ids: SymbolId[] = [];
      for (const [candidate, matches] of map) {
        if (candidate.includes(key)) {
          ids.push(...matches);
        }
      }
      return [...new Set(ids)].map((id) => this.toIndexed(id));
    }
    return (map.get(key) ?? []).map((id) => this.toIndexed(id));
  }

  /** List symbols, optionally filtered by kind, file, export status, or name. */
  public listSymbols(filter: SymbolListFilter = {}): IndexedSymbol[] {
    this.ensureResolved();
    const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
    return this.order
      .map((id) => this.symbols.get(id))
      .filter((symbol): symbol is Symbol => symbol !== undefined)
      .filter(
        (symbol) =>
          (filter.kind === undefined || kinds.includes(symbol.kind)) &&
          (filter.filePath === undefined || symbol.filePath === filter.filePath) &&
          (filter.exported === undefined || symbol.exported === filter.exported) &&
          (filter.name === undefined || symbol.name === filter.name),
      )
      .map((symbol) => this.toIndexed(symbol.id));
  }

  /**
   * Return every usage that resolves to the given symbol (across all indexed
   * files, including usages in files that import it).
   */
  public findReferences(symbolId: SymbolId): Reference[] {
    this.ensureResolved();
    return this.referencesByTarget.get(symbolId) ?? [];
  }

  /**
   * Every reference indexed so far.
   *
   * Targets are resolved for same-file usages only (matching
   * `ParsedFile.references`); cross-file usages resolve to the local import
   * binding, never to the imported definition. The indexer's full cross-file
   * resolution lives in {@link findReferences}.
   */
  public references(): readonly Reference[] {
    return this.storedReferences;
  }

  /**
   * Return the definition(s) matching a name, or the symbol with the given id.
   * When `query` is a known {@link SymbolId}, the single symbol is returned;
   * otherwise every definition whose name matches (including overloads).
   */
  public findDefinitions(query: string | SymbolId): IndexedSymbol[] {
    this.ensureResolved();
    const byId = this.symbols.get(query as SymbolId);
    if (byId !== undefined) {
      return [this.toIndexed(byId.id)];
    }
    return this.findSymbol(query);
  }

  /** Every file path indexed so far. */
  public filePaths(): readonly FilePath[] {
    return [...this.files.keys()];
  }

  private ensureResolved(): void {
    if (this.dirty) {
      this.resolve();
    }
  }

  private addSymbol(symbol: Symbol): void {
    this.symbols.set(symbol.id, symbol);
    this.order.push(symbol.id);
    pushToMap(this.byName, symbol.name, symbol.id);
    pushToMap(this.byNameLower, symbol.name.toLowerCase(), symbol.id);
    pushToMap(this.byFile, symbol.filePath, symbol.id);
    if (symbol.parentId !== null) {
      pushToMap(this.children, symbol.parentId, symbol.id);
    }
  }

  /**
   * The symbols a reference resolves to: its same-file target plus, when that
   * target is an import binding, the definition(s) in the imported module.
   */
  private resolveTargets(reference: Reference): readonly SymbolId[] {
    const targets: SymbolId[] = [];
    if (reference.targetSymbolId !== null) {
      targets.push(reference.targetSymbolId);
    }
    const primary =
      reference.targetSymbolId === null ? undefined : this.symbols.get(reference.targetSymbolId);
    if (primary !== undefined && primary.kind === "import" && primary.moduleSpecifier !== null) {
      for (const definition of this.definitionsForImport(primary)) {
        targets.push(definition.id);
      }
    }
    return targets;
  }

  /**
   * The definitions in the imported module that an import binding refers to.
   *
   * Named imports match by the name used **in the module** — for renamed
   * imports (`import { a as b }`) that is `importedName` (`"a"`), not the local
   * alias (`"b"`). Default imports resolve to the module's default export: any
   * exported symbol carrying a `"default"` modifier, or the `export default
   * <expr>` assignment symbol named `"default"`.
   */
  private definitionsForImport(importSymbol: Symbol): readonly Symbol[] {
    const specifier = importSymbol.moduleSpecifier;
    if (specifier === null) {
      return [];
    }
    const targetFile = this.resolveModulePath(importSymbol.filePath, specifier);
    if (targetFile === undefined) {
      return [];
    }
    const ids = this.byFile.get(targetFile) ?? [];
    const candidates = ids
      .map((id) => this.symbols.get(id))
      .filter((symbol): symbol is Symbol => symbol !== undefined)
      .filter((symbol) => symbol.exported);

    const isDefault = importSymbol.modifiers.includes("default");
    if (isDefault) {
      // `export default function/class/…` symbols carry a "default" modifier;
      // the `export default <expr>` assignment symbol is itself named "default".
      return candidates.filter(
        (symbol) => symbol.modifiers.includes("default") || symbol.name === "default",
      );
    }
    const importedName = importSymbol.importedName ?? importSymbol.name;
    return candidates.filter((symbol) => symbol.name === importedName);
  }

  /** Resolve a relative module specifier to an indexed file path. */
  private resolveModulePath(fromFile: FilePath, specifier: string): FilePath | undefined {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      return undefined; // bare / node modules are not locally indexed
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
      if (this.normalizedFilePaths.has(candidate)) {
        return this.pathsByNormalized.get(candidate);
      }
    }
    return undefined;
  }

  private toIndexed(id: SymbolId): IndexedSymbol {
    const symbol = this.symbols.get(id);
    if (symbol === undefined) {
      throw new SymbolNotIndexedError(id);
    }
    return {
      ...symbol,
      children: this.children.get(id) ?? [],
      references: this.referencesByTarget.get(id) ?? [],
    };
  }
}

/** Append `value` to the array stored under `key` in `map`. */
function pushToMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else {
    list.push(value);
  }
}

/**
 * Resolve a relative module specifier (e.g. `"./utils"`) against a source
 * file into a normalized, forward-slash path with `.` and `..` segments
 * collapsed. Cross-platform: Windows separators are normalized to `/`.
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
