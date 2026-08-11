import type {
  ContextData,
  ContextDatabasePort,
  ContextDeleteTarget,
  ContextSnapshot,
  PersistedDependency,
  SourceFile,
  Summary,
  Symbol,
} from "@atlas/core";
import type { FilePath, NodeId, SymbolId } from "@atlas/shared";
import {
  DatabaseError,
  DependencyNotFoundError,
  FileNotFoundError,
  SymbolNotFoundError,
} from "./errors";
import type { ModuleContext, ProjectCounts } from "./models";
import { buildNodeLabels, fileNodeId, symbolNodeId } from "./nodes";

/**
 * Read repositories for the Context SDK.
 *
 * Every method reads through the injected `ContextDatabasePort` — the same
 * contract the `@atlas/search` index uses — and maps stored rows to normalized
 * context models. No SQL appears here and driver failures are re-surfaced as
 * typed SDK errors, so consumers never depend on database internals.
 */
export class ReadRepositories {
  public constructor(private readonly port: ContextDatabasePort) {}

  /** Load the current snapshot, wrapping driver failures as `DatabaseError`s. */
  public loadSnapshot(): ContextSnapshot {
    try {
      return this.port.loadContext();
    } catch (error) {
      throw new DatabaseError("Failed to read the context database.", error);
    }
  }

  // ── files ─────────────────────────────────────────────────────────────────

  /** A file by path; throws {@link FileNotFoundError} when missing. */
  public getFile(path: FilePath): SourceFile {
    const file = this.loadSnapshot().files?.find((f) => f.path === path);
    if (file === undefined) {
      throw new FileNotFoundError(path);
    }
    return file;
  }

  /** A file by path, or `undefined` when missing (non-throwing accessor). */
  public findFile(path: FilePath): SourceFile | undefined {
    return this.loadSnapshot().files?.find((f) => f.path === path);
  }

  /** All indexed files. */
  public listFiles(): readonly SourceFile[] {
    return this.loadSnapshot().files ?? [];
  }

  // ── symbols ────────────────────────────────────────────────────────────────

  /** A symbol by id; throws {@link SymbolNotFoundError} when missing. */
  public getSymbol(symbolId: SymbolId): Symbol {
    const symbol = this.loadSnapshot().symbols?.find((s) => s.id === symbolId);
    if (symbol === undefined) {
      throw new SymbolNotFoundError(symbolId);
    }
    return symbol;
  }

  /** All indexed symbols. */
  public listSymbols(): readonly Symbol[] {
    return this.loadSnapshot().symbols ?? [];
  }

  /**
   * The symbols that reference the given symbol — incoming edges whose target is
   * the symbol's graph node, resolved from the persisted dependency/relationship
   * snapshot (mirroring the graph's node scheme without importing it).
   */
  public referencesTo(
    symbolId: SymbolId,
  ): ReadonlyArray<{ readonly symbol: Symbol; readonly kind: string }> {
    const snapshot = this.loadSnapshot();
    const target = symbolNodeId(symbolId);
    const byNode = symbolNodeMap(snapshot);
    const references: Array<{ symbol: Symbol; kind: string }> = [];

    for (const edge of snapshot.dependencies ?? []) {
      if (edge.to === target) {
        const source = byNode.get(edge.from);
        if (source !== undefined) {
          references.push({ symbol: source, kind: edge.kind });
        }
      }
    }
    for (const relationship of snapshot.relationships ?? []) {
      if (relationship.targetId === target) {
        const source = byNode.get(relationship.sourceId);
        if (source !== undefined) {
          references.push({ symbol: source, kind: relationship.type });
        }
      }
    }
    return references;
  }

  // ── dependencies ───────────────────────────────────────────────────────────

  /** Every persisted dependency edge, with resolved endpoint labels. */
  public listDependencies(): ReadonlyArray<{
    readonly edge: PersistedDependency;
    readonly fromLabel: string;
    readonly toLabel: string;
  }> {
    const snapshot = this.loadSnapshot();
    const labels = buildNodeLabels(snapshot);
    return (snapshot.dependencies ?? []).map((edge) => ({
      edge,
      fromLabel: labels.get(edge.from) ?? edge.from,
      toLabel: labels.get(edge.to) ?? edge.to,
    }));
  }

  /**
   * Resolve a node reference (file path, symbol id, symbol name, or raw `n:…`
   * node id) to the set of matching graph node ids; throws
   * {@link DependencyNotFoundError} when nothing matches.
   *
   * Returns the matching node ids keyed by their human-readable label.
   */
  public resolveNode(
    target: string,
  ): ReadonlyArray<{ readonly nodeId: string; readonly label: string }> {
    const snapshot = this.loadSnapshot();
    const matches: Array<{ nodeId: string; label: string }> = [];
    if (target.startsWith("n:")) {
      matches.push({ nodeId: target, label: target });
    }
    for (const file of snapshot.files ?? []) {
      if (file.path === target) {
        matches.push({ nodeId: fileNodeId(file.path), label: file.path });
      }
    }
    for (const symbol of snapshot.symbols ?? []) {
      if (symbol.id === target || symbol.name === target) {
        matches.push({
          nodeId: symbolNodeId(symbol.id),
          label: `${symbol.name} (${symbol.filePath})`,
        });
      }
    }
    if (matches.length === 0) {
      throw new DependencyNotFoundError(target);
    }
    return matches;
  }

  // ── modules ────────────────────────────────────────────────────────────────

  /** All indexed modules. */
  public listModules(): readonly ModuleContext[] {
    return this.loadSnapshot().modules ?? [];
  }

  // ── summaries ──────────────────────────────────────────────────────────────

  /** All stored summaries. */
  public listSummaries(): readonly Summary[] {
    return this.loadSnapshot().summaries ?? [];
  }

  /**
   * The persisted per-file SHA-256 hashes (path → hex digest), used to detect
   * whether the index is stale vs the working tree (see the SDK's
   * `context-integration` staleness signal).
   */
  public hashes(): Readonly<Record<string, string>> {
    return this.loadSnapshot().hashes ?? {};
  }

  /** A summary by (kind, target), or `undefined`. */
  public findSummary(kind: Summary["kind"], target: string): Summary | undefined {
    return this.loadSnapshot().summaries?.find((s) => s.kind === kind && s.target === target);
  }

  /** Aggregate counts across every entity kind. */
  public counts(): ProjectCounts {
    const snapshot = this.loadSnapshot();
    return {
      files: (snapshot.files ?? []).length,
      symbols: (snapshot.symbols ?? []).length,
      modules: (snapshot.modules ?? []).length,
      dependencies: (snapshot.dependencies ?? []).length,
      summaries: (snapshot.summaries ?? []).length,
    };
  }
}

/**
 * The write edge of the Context SDK — explicitly separated from the read edge.
 *
 * Consumers (CLI, MCP, editors, agents) should normally use the read APIs.
 * The indexing pipeline owns these calls (building/updating the index).
 */
export class WriteRepositories {
  public constructor(private readonly port: ContextDatabasePort) {}

  /** Full replace of the stored context (removes whatever is not provided). */
  public save(data: ContextData): number {
    return this.guard(() => this.port.saveContext(data));
  }

  /** Merge: upsert only the provided entities, keeping the rest. */
  public update(data: ContextData): number {
    return this.guard(() => this.port.updateContext(data));
  }

  /** Remove targeted entities (files/symbols cascade clean up dependents). */
  public deleteTo(target: ContextDeleteTarget): number {
    return this.guard(() => this.port.deleteContext(target));
  }

  private guard(operation: () => number): number {
    try {
      return operation();
    } catch (error) {
      throw new DatabaseError("Failed to write the context database.", error);
    }
  }
}

/** Map every known symbol graph node id back to its {@link Symbol}. */
function symbolNodeMap(snapshot: ContextSnapshot): ReadonlyMap<NodeId, Symbol> {
  const byNode = new Map<NodeId, Symbol>();
  for (const symbol of snapshot.symbols ?? []) {
    byNode.set(symbolNodeId(symbol.id), symbol);
  }
  return byNode;
}
