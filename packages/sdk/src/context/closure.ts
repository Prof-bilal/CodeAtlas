/**
 * Dependency-closure expansion (Phase 1, P1.4 — small-model intelligence
 * execution plan).
 *
 * Pure, deterministic expansion of seed files (search hits) into the related
 * files a task actually needs: direct callers and callees (1 hop by default,
 * 2 with budget), tests for touched files (`*.test.ts` convention plus graph
 * reference edges), config touchpoints, and interface/type definitions.
 *
 * Reads only a `ContextSnapshot`'s data (files, symbols, dependencies) — it
 * never touches the database directly and never executes anything. Every
 * expanded item carries a deterministic human-readable `reason`; annotation is
 * exactly what a small model cannot derive itself (ADR-014).
 *
 * Graph node ids mirror `@atlas/graph`'s convention without importing it:
 * files are `n:file:<forward-slash-path>`, symbols are `n:<symbolId>`.
 */

import type {
  Symbol as CodeSymbol,
  ContextSnapshot,
  ContextTier,
  PersistedDependency,
} from "@atlas/core";
import type { FilePath } from "@atlas/shared";

/** The file prefix of `@atlas/graph` file node ids. */
const FILE_NODE_PREFIX = "n:file:";

/** What relationship an expanded file has to a seed. */
export type ClosureKind = "caller" | "callee" | "test" | "config" | "interface";

/** One expanded file with its deterministic selection explanation. */
export interface ClosureExpansion {
  readonly path: FilePath;
  readonly kind: ClosureKind;
  /** Deterministic reason (e.g. `"caller of src/auth.ts via imports"`). */
  readonly reason: string;
  /** Hierarchy tier assigned by the closure (ADR-014). */
  readonly tier: ContextTier;
  /** Graph hop distance from the seed (1 = direct neighbor). */
  readonly hop: number;
  /** Structured annotations (e.g. `{ testsFor: "src/auth.ts" }`). */
  readonly annotations: Readonly<Record<string, string>>;
}

/** Options for {@link expandDependencyClosure}. */
export interface ClosureOptions {
  /** Graph hops to expand (1 or 2; default 1). */
  readonly hops?: number;
  /** Maximum expansions kept per seed (default 8). */
  readonly maxPerSeed?: number;
  /** Include `*.test.ts` / `__tests__/` files (default `true`). */
  readonly includeTests?: boolean;
  /** Include config touchpoints (default `true`). */
  readonly includeConfig?: boolean;
}

/** The snapshot parts the closure needs (all optional-safe). */
export type ClosureSnapshot = Pick<ContextSnapshot, "files" | "symbols" | "dependencies">;

/** Kind priority for deterministic ordering (lower sorts first). */
const KIND_PRIORITY: Readonly<Record<ClosureKind, number>> = {
  caller: 0,
  callee: 1,
  interface: 2,
  test: 3,
  config: 4,
};

/** Files that look like test files (`*.test.ts`, `*.spec.js`, `__tests__/`). */
const TEST_FILE_RE = /(^|\/)(__tests__\/|__tests__\\)|\.test\.|\.spec\./;

/** Recognized config touchpoints (narrow list — advisory context only). */
const CONFIG_FILE_RE =
  /(^|\/)(package|tsconfig|jsconfig|vitest\.config|jest\.config|vite\.config|webpack\.config|rollup\.config|eslint|biome)(\.[\w-]+)*\.(json|js|ts|mjs|cjs|ya?ml|toml)$|(^|\/)\.env\.example$/;

/** Graph node id for a file (mirrors `@atlas/graph` without importing it). */
function fileNodeId(path: string): string {
  return `${FILE_NODE_PREFIX}${path.replace(/\\/g, "/")}`;
}

/** The file path a graph node id refers to, or `null` for symbol nodes. */
function filePathOf(nodeId: string): string | null {
  if (!nodeId.startsWith(FILE_NODE_PREFIX)) {
    return null;
  }
  return nodeId.slice(FILE_NODE_PREFIX.length);
}

interface AdjacencyEntry {
  readonly nodeId: string;
  readonly kind: string;
}

/** Build a node-id adjacency map (both directions) from persisted edges. */
function buildAdjacency(
  dependencies: readonly PersistedDependency[],
): Map<string, AdjacencyEntry[]> {
  const adjacency = new Map<string, AdjacencyEntry[]>();
  const add = (from: string, to: string, kind: string): void => {
    const list = adjacency.get(from) ?? [];
    list.push({ nodeId: to, kind });
    adjacency.set(from, list);
  };
  for (const edge of dependencies) {
    add(edge.from, edge.to, edge.kind);
    add(edge.to, edge.from, edge.kind);
  }
  return adjacency;
}

/**
 * Expand seed files into their dependency closure.
 *
 * Deterministic: same snapshot + seeds + options ⇒ same output, in a stable
 * order (hop, kind priority, then path). Seeds themselves are never returned;
 * the caller assigns them the `critical` tier. Caps every seed's fan-out at
 * `maxPerSeed` so a hub file cannot flood the context.
 */
export function expandDependencyClosure(
  snapshot: ClosureSnapshot,
  seeds: readonly string[],
  options: ClosureOptions = {},
): readonly ClosureExpansion[] {
  const hops = Math.min(Math.max(options.hops ?? 1, 1), 2);
  const maxPerSeed = Math.max(options.maxPerSeed ?? 8, 1);
  const includeTests = options.includeTests ?? true;
  const includeConfig = options.includeConfig ?? true;

  const normalizedSeeds = [...new Set(seeds.map((seed) => seed.replace(/\\/g, "/")))].filter(
    (seed) => seed.length > 0,
  );
  if (normalizedSeeds.length === 0) {
    return [];
  }

  // Map symbol nodes to their containing file so symbol-level edges resolve.
  const symbolFile = new Map<string, string>();
  for (const symbol of snapshot.symbols ?? ([] as readonly CodeSymbol[])) {
    symbolFile.set(symbol.id, symbol.filePath.replace(/\\/g, "/"));
  }

  const adjacency = buildAdjacency(snapshot.dependencies ?? []);

  // Files declaring an `interface` (or type-like) symbol: expansions landing
  // there are promoted to the `interface` closure kind.
  const interfaceFiles = new Set<string>();
  for (const symbol of snapshot.symbols ?? ([] as readonly CodeSymbol[])) {
    if (symbol.kind === "interface" || symbol.kind === "type-alias") {
      interfaceFiles.add(symbol.filePath.replace(/\\/g, "/"));
    }
  }

  const seedNodeIds = new Set(normalizedSeeds.map(fileNodeId));
  const results = new Map<string, ClosureExpansion>();

  // BFS frontier of node ids per hop, tracking which seed discovered each.
  interface Discovered {
    nodeId: string;
    seed: string;
    hop: number;
    via: string;
  }
  let frontier: Discovered[] = normalizedSeeds.flatMap((seed) =>
    (adjacency.get(fileNodeId(seed)) ?? []).map((entry) => ({
      nodeId: entry.nodeId,
      seed,
      hop: 1,
      via: entry.kind,
    })),
  );
  const visited = new Set(seedNodeIds);

  for (let hop = 1; hop <= hops && frontier.length > 0; hop += 1) {
    const next: Discovered[] = [];
    for (const { nodeId, seed, via } of frontier) {
      if (visited.has(nodeId)) {
        continue;
      }
      visited.add(nodeId);
      const path = filePathOf(nodeId) ?? symbolFile.get(nodeId.slice("n:".length)) ?? null;
      if (path === null || path === seed || seedNodeIds.has(nodeId)) {
        continue;
      }
      let expansion = classify(path, seed, hop, via, includeTests, includeConfig);
      if (expansion === null) {
        continue;
      }
      if (
        (expansion.kind === "caller" || expansion.kind === "callee") &&
        interfaceFiles.has(path)
      ) {
        expansion = {
          ...expansion,
          kind: "interface",
          reason: `interface/type definition related to ${seed} (via ${via})`,
        };
      }
      const existing = results.get(path);
      if (existing === undefined || KIND_PRIORITY[expansion.kind] < KIND_PRIORITY[existing.kind]) {
        results.set(path, expansion);
      }
      // Only file nodes keep expanding through the graph.
      if (hop < hops && nodeId.startsWith(FILE_NODE_PREFIX)) {
        for (const entry of adjacency.get(nodeId) ?? []) {
          next.push({ nodeId: entry.nodeId, seed, hop: hop + 1, via: entry.kind });
        }
      }
    }
    frontier = next;
  }

  // Cap per seed after sorting deterministically.
  const sorted = [...results.values()].sort((a, b) =>
    a.hop !== b.hop
      ? a.hop - b.hop
      : KIND_PRIORITY[a.kind] !== KIND_PRIORITY[b.kind]
        ? KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]
        : a.path.localeCompare(b.path),
  );
  const perSeed = new Map<string, number>();
  const kept: ClosureExpansion[] = [];
  for (const expansion of sorted) {
    const seedKey = expansion.annotations["seed"];
    const count = perSeed.get(seedKey) ?? 0;
    if (count >= maxPerSeed) {
      continue;
    }
    perSeed.set(seedKey, count + 1);
    // The internal `seed` annotation is stripped from the public shape.
    const { ["seed"]: _seed, ...rest } = expansion.annotations;
    kept.push({ ...expansion, annotations: rest });
  }
  return kept;
}

/** Classify one reached file into a {@link ClosureExpansion}, or `null`. */
function classify(
  path: string,
  seed: string,
  hop: number,
  via: string,
  includeTests: boolean,
  includeConfig: boolean,
): ClosureExpansion | null {
  if (TEST_FILE_RE.test(path)) {
    if (!includeTests) {
      return null;
    }
    return {
      path: path as FilePath,
      kind: "test",
      reason: `tests for ${seed} (matched by test-file convention)`,
      tier: "important",
      hop,
      annotations: { testsFor: seed, seed, closureHop: String(hop) },
    };
  }
  if (CONFIG_FILE_RE.test(path)) {
    if (!includeConfig) {
      return null;
    }
    return {
      path: path as FilePath,
      kind: "config",
      reason: `configuration touchpoint related to ${seed}`,
      tier: "supporting",
      hop,
      annotations: { relatedTo: seed, seed, closureHop: String(hop) },
    };
  }
  const isCaller = via === "imports" || via === "references" || via === "calls";
  const kind: ClosureKind = isCaller && hop === 1 ? "caller" : "callee";
  return {
    path: path as FilePath,
    kind,
    reason:
      hop === 1
        ? `${kind} of ${seed} (via ${via}, 1 hop)`
        : `${kind} of ${seed} (via ${via}, ${hop} hops)`,
    tier: "important",
    hop,
    annotations: { seed, closureHop: String(hop), edge: via },
  };
}
