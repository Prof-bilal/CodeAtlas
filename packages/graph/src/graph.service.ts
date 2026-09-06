import type {
  Cycle,
  GraphEdge,
  GraphNode,
  GraphPort,
  Reference,
  ReferenceKind,
  Symbol,
} from "@atlas/core";
import type { EdgeId, FilePath, NodeId, Result } from "@atlas/shared";
import { ok } from "@atlas/shared";
import { fileNodeId, symbolNodeId } from "./ids";
import { buildExportIndex, resolveModulePath } from "./module-resolution";

/** Every edge kind the graph emits. */
export const EDGE_KINDS = {
  calls: "calls",
  constructs: "constructs",
  accesses: "accesses",
  references: "references",
  reads: "reads",
  writes: "writes",
  extends: "extends",
  implements: "implements",
  imports: "imports",
  exports: "exports",
  contains: "contains",
  "tested-by": "tested-by",
} as const;

/** A concrete edge kind emitted by the graph. */
export type EdgeKind = (typeof EDGE_KINDS)[keyof typeof EDGE_KINDS];

/** Map a parser {@link ReferenceKind} onto its graph edge kind. */
const REFERENCE_KIND_TO_EDGE: Record<ReferenceKind, EdgeKind> = {
  call: "calls",
  construct: "constructs",
  property: "accesses",
  type: "references",
  read: "reads",
  write: "writes",
  extends: "extends",
  implements: "implements",
};

/**
 * In-memory code-dependency graph behind the `GraphPort` contract.
 *
 * Built from the parser's normalized `Symbol`s and resolved `Reference`s via
 * {@link build}. Tracks imports, exports, calls, class inheritance, interface
 * implementations, and module dependencies as directed edges between symbol
 * nodes and per-file pseudo-nodes.
 */
export class GraphService implements GraphPort {
  private readonly nodes = new Map<NodeId, GraphNode>();
  private readonly edges = new Map<EdgeId, GraphEdge>();
  private readonly out = new Map<NodeId, Map<NodeId, string[]>>();
  private readonly in = new Map<NodeId, Map<NodeId, string[]>>();
  private readonly seenEdges = new Set<string>();
  private unresolvedImports = 0;

  /**
   * Rebuild the graph from parsed symbols and resolved references. Resets any
   * previously built state.
   */
  public build(symbols: readonly Symbol[], references: readonly Reference[]): this {
    this.clear();

    const files = new Map<string, FilePath>();
    const byFile = new Map<FilePath, Symbol[]>();

    const registerFile = (path: FilePath): void => {
      const normalized = path.replace(/\\/g, "/");
      if (!files.has(normalized)) {
        files.set(normalized, path);
      }
    };

    // Symbol nodes, grouped by file for containment lookups.
    for (const symbol of symbols) {
      registerFile(symbol.filePath);
      this.nodes.set(symbolNodeId(symbol.id), { id: symbolNodeId(symbol.id), symbolId: symbol.id });
      const list = byFile.get(symbol.filePath);
      if (list === undefined) {
        byFile.set(symbol.filePath, [symbol]);
      } else {
        list.push(symbol);
      }
    }
    for (const reference of references) {
      registerFile(reference.filePath);
    }

    // File pseudo-nodes (one per source file).
    for (const path of files.values()) {
      this.nodes.set(fileNodeId(path), { id: fileNodeId(path), symbolId: null });
    }

    // Usage edges: resolved references from their innermost containing symbol
    // (or the file node at module scope) to their target.
    for (const reference of references) {
      if (reference.targetSymbolId === null) {
        continue;
      }
      const targetId = symbolNodeId(reference.targetSymbolId);
      if (!this.nodes.has(targetId)) {
        continue;
      }
      const containing = containingSymbol(byFile.get(reference.filePath) ?? [], reference);
      const sourceId =
        containing === undefined ? fileNodeId(reference.filePath) : symbolNodeId(containing.id);
      this.addEdgeRaw(sourceId, targetId, REFERENCE_KIND_TO_EDGE[reference.kind]);
    }

    // Symbol import edges: import binding -> the definition it resolves to.
    // The export index is built once (O(symbols)) so per-import lookup is O(1)
    // instead of a full `symbols.filter` scan per import.
    const exportIndex = buildExportIndex(symbols);
    for (const symbol of symbols) {
      if (symbol.kind !== "import" || symbol.moduleSpecifier === null) {
        continue;
      }
      const targetFile = resolveModulePath(symbol.filePath, symbol.moduleSpecifier, files);
      if (targetFile === undefined) {
        // Unresolved import (honesty over silence, Phase 5): a relative
        // specifier that names no indexed file, or a bare/alias specifier that
        // is not a known external package (`node:` builtins and `@scope/pkg`
        // dependencies are expected and not counted). Counted so the overview
        // can report how much of the graph is thin.
        if (!isExternalSpecifier(symbol.moduleSpecifier)) {
          this.unresolvedImports += 1;
        }
        continue;
      }
      const isDefault = symbol.modifiers.includes("default");
      const byName = exportIndex.get(targetFile);
      const candidates =
        isDefault && byName !== undefined
          ? [...byName.values()]
              .flat()
              .filter((d) => d.modifiers.includes("default") || d.name === "default")
          : (byName?.get(symbol.importedName ?? symbol.name) ?? []);
      for (const definition of candidates) {
        this.addEdgeRaw(symbolNodeId(symbol.id), symbolNodeId(definition.id), "imports");
      }
    }

    // Module dependency edges: importing/reexporting file -> imported file.
    for (const symbol of symbols) {
      if (symbol.moduleSpecifier === null) {
        continue;
      }
      const targetFile = resolveModulePath(symbol.filePath, symbol.moduleSpecifier, files);
      if (targetFile !== undefined) {
        this.addEdgeRaw(fileNodeId(symbol.filePath), fileNodeId(targetFile), "imports");
      }
    }

    // Export edges: file -> its exported symbols.
    for (const symbol of symbols) {
      if (symbol.exported) {
        this.addEdgeRaw(fileNodeId(symbol.filePath), symbolNodeId(symbol.id), "exports");
      }
    }

    // Structural edges: parent symbol -> child symbol.
    for (const symbol of symbols) {
      if (symbol.parentId !== null) {
        this.addEdgeRaw(symbolNodeId(symbol.parentId), symbolNodeId(symbol.id), "contains");
      }
    }

    // Test edges (F4): derive `tested-by` links from file naming conventions
    // so "what tests cover this?" is a graph query, not a same-dir filename
    // scan. Convention: a file is a test when it sits in `__tests__/`, or its
    // stem ends in `.test`/`.spec`; the implementation under test is the file
    // with the same stem in the parent directory, or the sibling with the stem
    // before the `.test`/`.spec` marker. Edge direction: impl file -> test
    // file (`tested-by`).
    const testEdges = deriveTestEdges([...files.values()]);
    for (const { impl, test } of testEdges) {
      this.addEdgeRaw(fileNodeId(impl as FilePath), fileNodeId(test as FilePath), "tested-by");
    }

    return this;
  }

  public async addNode(node: GraphNode): Promise<Result<void>> {
    this.nodes.set(node.id, node);
    return ok(undefined);
  }

  public async addEdge(edge: GraphEdge): Promise<Result<void>> {
    this.addEdgeRaw(edge.from, edge.to, edge.kind);
    return ok(undefined);
  }

  public async neighbors(nodeId: NodeId): Promise<Result<readonly GraphNode[]>> {
    const merged = new Map<NodeId, GraphNode>();
    for (const id of this.adjacentNodeIds(this.out, nodeId)) {
      merged.set(id, this.nodeOrPlaceholder(id));
    }
    for (const id of this.adjacentNodeIds(this.in, nodeId)) {
      merged.set(id, this.nodeOrPlaceholder(id));
    }
    return ok([...merged.values()]);
  }

  public async getDependencies(nodeId: NodeId): Promise<Result<readonly GraphNode[]>> {
    return ok(this.adjacentNodes(this.out, nodeId));
  }

  public async getDependents(nodeId: NodeId): Promise<Result<readonly GraphNode[]>> {
    return ok(this.adjacentNodes(this.in, nodeId));
  }

  public async shortestPath(
    from: NodeId,
    to: NodeId,
  ): Promise<Result<readonly GraphNode[] | null>> {
    if (!this.nodes.has(from) || !this.nodes.has(to)) {
      return ok(null);
    }
    if (from === to) {
      return ok([this.nodeOrPlaceholder(from)]);
    }

    const previous = new Map<NodeId, NodeId>();
    const queue: NodeId[] = [from];
    previous.set(from, from);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of this.adjacentNodeIds(this.out, current)) {
        if (previous.has(next)) {
          continue;
        }
        previous.set(next, current);
        if (next === to) {
          return ok(this.reconstructPath(previous, from, to));
        }
        queue.push(next);
      }
    }

    return ok(null);
  }

  public async detectCircularDependencies(): Promise<Result<readonly Cycle[]>> {
    const cycles: NodeId[][] = [];
    for (const component of this.stronglyConnectedComponents()) {
      if (component.length > 1) {
        cycles.push(this.representativeCycle(component));
      } else {
        const [single] = component;
        const self = this.out.get(single);
        if (self !== undefined && self.has(single)) {
          cycles.push([single, single]);
        }
      }
    }
    return ok(cycles);
  }

  public async exportJson(): Promise<Result<string>> {
    const payload = {
      version: 1,
      nodes: [...this.nodes.values()],
      edges: [...this.edges.values()],
    };
    return ok(JSON.stringify(payload, null, 2));
  }

  /**
   * Every edge as `{ from, to, kind }`, without the JSON serialization
   * round-trip of {@link exportJson}. Consumers that only need the edge list
   * (e.g. the indexer persisting dependencies) should prefer this.
   */
  public async exportEdges(): Promise<
    Result<readonly { readonly from: NodeId; readonly to: NodeId; readonly kind: string }[]>
  > {
    return ok([...this.edges.values()].map(({ from, to, kind }) => ({ from, to, kind })));
  }

  private clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.out.clear();
    this.in.clear();
    this.seenEdges.clear();
    this.unresolvedImports = 0;
  }

  /** Number of import specifiers that could not be resolved to an indexed file. */
  public unresolvedImportCount(): number {
    return this.unresolvedImports;
  }

  private addEdgeRaw(from: NodeId, to: NodeId, kind: string): void {
    const key = `${from}>${to}#${kind}`;
    if (this.seenEdges.has(key)) {
      return;
    }
    this.seenEdges.add(key);
    this.ensureNode(from);
    this.ensureNode(to);
    this.edges.set(`e:${key}` as EdgeId, { id: `e:${key}` as EdgeId, from, to, kind });
    pushKind(this.out, from, to, kind);
    pushKind(this.in, to, from, kind);
  }

  private ensureNode(id: NodeId): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, symbolId: null });
    }
  }

  private nodeOrPlaceholder(id: NodeId): GraphNode {
    return this.nodes.get(id) ?? { id, symbolId: null };
  }

  private adjacentNodes(
    map: Map<NodeId, Map<NodeId, string[]>>,
    nodeId: NodeId,
  ): readonly GraphNode[] {
    return this.adjacentNodeIds(map, nodeId).map((id) => this.nodeOrPlaceholder(id));
  }

  private adjacentNodeIds(
    map: Map<NodeId, Map<NodeId, string[]>>,
    nodeId: NodeId,
  ): readonly NodeId[] {
    const adjacency = map.get(nodeId);
    return adjacency === undefined ? [] : [...adjacency.keys()];
  }

  private reconstructPath(
    previous: ReadonlyMap<NodeId, NodeId>,
    from: NodeId,
    to: NodeId,
  ): GraphNode[] {
    return this.reconstructPathIds(previous, from, to).map((id) => this.nodeOrPlaceholder(id));
  }

  private reconstructPathIds(
    previous: ReadonlyMap<NodeId, NodeId>,
    from: NodeId,
    to: NodeId,
  ): NodeId[] {
    const path: NodeId[] = [];
    let cursor: NodeId | undefined = to;
    while (cursor !== undefined) {
      path.unshift(cursor);
      if (cursor === from) {
        break;
      }
      cursor = previous.get(cursor);
    }
    return path;
  }

  private stronglyConnectedComponents(): NodeId[][] {
    const index = new Map<NodeId, number>();
    const lowlink = new Map<NodeId, number>();
    const onStack = new Set<NodeId>();
    const stack: NodeId[] = [];
    const components: NodeId[][] = [];
    let counter = 0;

    const visit = (node: NodeId): void => {
      index.set(node, counter);
      lowlink.set(node, counter);
      counter += 1;
      stack.push(node);
      onStack.add(node);

      for (const next of this.adjacentNodeIds(this.out, node)) {
        if (!index.has(next)) {
          visit(next);
          lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(next)!));
        } else if (onStack.has(next)) {
          lowlink.set(node, Math.min(lowlink.get(node)!, index.get(next)!));
        }
      }

      if (lowlink.get(node) === index.get(node)) {
        const component: NodeId[] = [];
        let member: NodeId;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
        } while (member !== node);
        components.push(component);
      }
    };

    for (const node of this.nodes.keys()) {
      if (!index.has(node)) {
        visit(node);
      }
    }
    return components;
  }

  /**
   * The shortest cycle through the first node of a nontrivial strongly
   * connected component, as an ordered node list whose last node connects back
   * to the first.
   */
  private representativeCycle(component: readonly NodeId[]): NodeId[] {
    const inComponent = new Set(component);
    const start = component[0];
    const previous = new Map<NodeId, NodeId>();
    const queue: NodeId[] = [start];
    previous.set(start, start);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of this.adjacentNodeIds(this.out, current)) {
        if (!inComponent.has(next) || previous.has(next)) {
          continue;
        }
        previous.set(next, current);
        const nextOut = this.out.get(next);
        if (nextOut !== undefined && nextOut.has(start)) {
          return [start, ...this.reconstructPathIds(previous, start, next)];
        }
        queue.push(next);
      }
    }

    return [start];
  }
}

/** Append `kind` to the kinds stored under `(from, to)` in `map`. */
function pushKind(
  map: Map<NodeId, Map<NodeId, string[]>>,
  from: NodeId,
  to: NodeId,
  kind: string,
): void {
  let targets = map.get(from);
  if (targets === undefined) {
    targets = new Map();
    map.set(from, targets);
  }
  let kinds = targets.get(to);
  if (kinds === undefined) {
    kinds = [];
    targets.set(to, kinds);
  }
  kinds.push(kind);
}

/**
 * True when a module specifier refers to something outside the indexed corpus
 * by design: Node builtins (`node:fs`) or a bare package (`react`,
 * `@scope/pkg`, `.json` asset). These are expected to be unresolved and are not
 * counted as thin-index noise.
 */
function isExternalSpecifier(specifier: string): boolean {
  if (specifier.startsWith("node:")) {
    return true;
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return false;
  }
  // Bare specifier: package name or scoped package (a local alias like `@/lib`
  // is also bare — counted, since resolving it is the Phase 5 follow-up).
  return !specifier.startsWith("@/") && !specifier.startsWith("@src/");
}

/**
 * The innermost symbol whose source span contains a reference, or `undefined`
 * when the reference is at module scope.
 *
 * Containment is column-aware (the parser's own check is line-only, which
 * mis-attributes same-line patterns) and excludes `import`/`export` bindings,
 * which are not scopes. Symbols are spans; nested spans share a start, so the
 * innermost container is the one with the lexicographically-greatest
 * `(startLine, startColumn)` **that also contains the reference**. Iterating in
 * descending start order finds it in the first match, making the pass
 * O(symbols + references) per file instead of O(references × symbols).
 */
function containingSymbol(symbols: readonly Symbol[], reference: Reference): Symbol | undefined {
  let best: Symbol | undefined;
  let bestStart = -1;
  for (const symbol of symbols) {
    if (symbol.kind === "import" || symbol.kind === "export") {
      continue;
    }
    const start = symbol.location.startLine * 1_000_000 + symbol.location.startColumn;
    // A container cannot start after the reference, so once we pass a symbol
    // that starts at/before the best-found container, nothing later can be
    // "more innermost" (they all start earlier).
    if (start <= bestStart) {
      continue;
    }
    if (!contains(symbol, reference)) {
      continue;
    }
    best = symbol;
    bestStart = start;
  }
  return best;
}

/** Column-aware source-span containment of a reference within a symbol. */
function contains(symbol: Symbol, reference: Reference): boolean {
  const span = symbol.location;
  const point = reference.location;
  if (point.startLine < span.startLine || point.endLine > span.endLine) {
    return false;
  }
  if (point.startLine === span.startLine && point.startColumn < span.startColumn) {
    return false;
  }
  if (point.endLine === span.endLine && point.endColumn > span.endColumn) {
    return false;
  }
  return true;
}

/**
 * Derive `{ impl, test }` file pairs from naming conventions:
 * - `src/auth/service.ts` ↔ `src/auth/service.test.ts` (or `.spec.ts`), and
 * - `src/auth/service.ts` ↔ `src/auth/__tests__/service.test.ts` (or a bare
 *   `src/auth/__tests__/service.ts` mirroring the impl's stem).
 *
 * The implementation file must actually exist in the file set. Returned paths
 * keep the caller's original spelling so file-node ids match the graph.
 */
export function deriveTestEdges(
  paths: readonly string[],
): readonly { readonly impl: string; readonly test: string }[] {
  const slash = (path: string): string => path.replace(/\\/g, "/");
  const stemOf = (path: string): string => {
    const base = slash(path).split("/").pop() ?? path;
    return base.replace(/\.[^.]+$/, "");
  };
  const testMarker = (path: string): string | null => {
    const base = slash(path).split("/").pop() ?? path;
    const match = /^(.*)\.(test|spec)\.[^.]+$/i.exec(base);
    return match === null ? null : (match[1] ?? "");
  };

  // Index non-test files by directory + stem so impl lookups are O(1).
  const implsByDirAndStem = new Map<string, Map<string, string>>();
  const testCandidates: Array<{ test: string; implDir: string; implStem: string }> = [];

  for (const path of paths) {
    const segments = slash(path).split("/");
    const dir = segments.slice(0, -1).join("/");
    const filename = segments[segments.length - 1] ?? "";
    const testsDirIndex = segments.lastIndexOf("__tests__");
    const marker = testMarker(path);

    const isTestFile = testsDirIndex !== -1 || marker !== null || /\.(test|spec)\./i.test(filename);

    if (!isTestFile) {
      const stem = stemOf(path);
      let byStem = implsByDirAndStem.get(dir);
      if (byStem === undefined) {
        byStem = new Map();
        implsByDirAndStem.set(dir, byStem);
      }
      byStem.set(stem, path);
      continue;
    }

    if (testsDirIndex !== -1) {
      // In __tests__/: `__tests__/foo.test.ts` tests `../foo.ts`; a bare
      // `__tests__/foo.ts` tests the same-stem file in the parent of
      // `__tests__`.
      const implDir = segments.slice(0, testsDirIndex).join("/");
      const stem = marker ?? stemOf(filename);
      testCandidates.push({ test: path, implDir, implStem: stem });
    } else if (marker !== null) {
      const implDir = dir;
      const implStem = marker;
      testCandidates.push({ test: path, implDir, implStem });
    }
  }

  const edges: Array<{ impl: string; test: string }> = [];
  for (const { test, implDir, implStem } of testCandidates) {
    const impl = implsByDirAndStem.get(implDir)?.get(implStem);
    if (impl !== undefined) {
      edges.push({ impl, test });
    }
  }
  return edges;
}
