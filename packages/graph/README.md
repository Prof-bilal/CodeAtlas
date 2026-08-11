# @atlas/graph

The code-dependency graph for CodeAtlas. Built from the parser's normalized
`Symbol`s and resolved `Reference`s, it models **imports, exports, function
calls, class inheritance, interface implementations, and module dependencies**
as a directed graph and answers dependency, reachability, and cycle queries.

Implements `GraphPort` from `@atlas/core`.

> **Status: implemented.** Graph construction, queries, cycle detection, and
> JSON export are built and tested. No visualization.

## Features

- **Directed graph** over symbols and files. Every symbol is a node; each
  source file gets a file node that anchors module-level usages, exports, and
  module dependencies.
- **Rich edge kinds**: `calls`, `constructs`, `accesses`, `references`,
  `reads`, `writes`, `extends`, `implements`, `imports`, `exports`, and
  `contains` (parent → child structure).
- **Queries** — outgoing dependencies, incoming dependents, shortest directed
  path (BFS), and cycle detection (Tarjan SCC, one representative cycle per
  strongly connected component, including self-loops).
- **JSON export** — `exportJson()` serializes nodes and edges; visualization is
  a future concern.

## Usage

```ts
import { GraphService, symbolNodeId } from "@atlas/graph";

// Feed the graph the parser's output (symbols + resolved references).
const graph = new GraphService().build(symbols, references);

const scale = symbolNodeId(scaleSymbol.id);
const deps = await graph.getDependencies(scale); // what scale depends on
const dependents = await graph.getDependents(scale); // what depends on scale

const path = await graph.shortestPath(mainFileNode, scale); // or null
const cycles = await graph.detectCircularDependencies();
const json = await graph.exportJson();
```

## Building

`build` expects **resolved** references: same-file targets are resolved by the
parser, and cross-file usages resolve to the local import binding. The graph
adds `importBinding → definition` edges to complete cross-file reachability.

```ts
import { SymbolIndexer, TypeScriptParser } from "@atlas/parser";
import { GraphService } from "@atlas/graph";

const parser = new TypeScriptParser();
const parsed = [];
for (const file of sourceFiles) {
  const result = await parser.parse(file);
  if (result.ok) parsed.push(result.value);
}
const indexer = new SymbolIndexer().index(parsed);
const graph = new GraphService().build(indexer.listSymbols(), indexer.references());
```

## Public API

- `build(symbols, references)` — (re)build the graph from parsed `Symbol`s and
  resolved `Reference`s.
- `addNode(node)` / `addEdge(edge)` — idempotent incremental upserts.
- `neighbors(nodeId)` — nodes related in either direction.
- `getDependencies(nodeId)` — outgoing neighbors (what this depends on).
- `getDependents(nodeId)` — incoming neighbors (what depends on this).
- `shortestPath(from, to)` — shortest directed path, or `null` when unreachable.
- `detectCircularDependencies()` — `Cycle[]`, where each cycle is an ordered
  list of node ids whose last node connects back to the first.
- `exportJson()` — `{ version, nodes, edges }` as a JSON string.
- `EDGE_KINDS` / `EdgeKind` — the edge kinds emitted by the graph.
- `symbolNodeId(symbolId)` / `fileNodeId(path)` — the deterministic node-id
  scheme, so callers can map nodes back to symbols and files.

## Limitations

- Renamed imports (`import { a as b }`), namespace imports, and
  `export default <expr>` do not resolve to their definitions today (the parser
  indexer does not track the original exported name).
- References that resolve to nothing (`targetSymbolId === null`) produce no
  edge; module-scope method calls like `c.area()` do not resolve through `c`.
- `extends` and `implements` are distinct edge kinds, classified by the parser's
  heritage detection.
- `detectCircularDependencies` reports all cycles (symbol and file level);
  filter by file-node ids for module-level cycles.
