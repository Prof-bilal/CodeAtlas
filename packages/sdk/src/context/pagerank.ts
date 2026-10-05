/** Options for {@link computePageRank}. */
export interface PageRankOptions {
  /** Damping factor (default `0.85`). */
  readonly damping?: number;
  /** Number of power iterations (default `20`). */
  readonly iterations?: number;
}

/**
 * Deterministic PageRank over a directed graph given as `from → to` edges.
 *
 * Used to score symbol importance once per index (aider-style repo map): nodes
 * with many incoming references (calls, imports, implementations) rank higher.
 * The result is deterministic because iteration order and the initial uniform
 * distribution are fixed.
 */
export function computePageRank(
  edges: readonly { readonly from: string; readonly to: string }[],
  options: PageRankOptions = {},
): Map<string, number> {
  const damping = options.damping ?? 0.85;
  const iterations = options.iterations ?? 20;

  const nodes = new Set<string>();
  const outLinks = new Map<string, string[]>();
  const inLinks = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.from === edge.to) {
      continue;
    }
    nodes.add(edge.from);
    nodes.add(edge.to);
    const out = outLinks.get(edge.from);
    if (out === undefined) {
      outLinks.set(edge.from, [edge.to]);
    } else {
      out.push(edge.to);
    }
    const incoming = inLinks.get(edge.to);
    if (incoming === undefined) {
      inLinks.set(edge.to, [edge.from]);
    } else {
      incoming.push(edge.from);
    }
  }

  const ranks = new Map<string, number>();
  const count = nodes.size;
  if (count === 0) {
    return ranks;
  }
  const initial = 1 / count;
  for (const node of nodes) {
    ranks.set(node, initial);
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let dangling = 0;
    for (const node of nodes) {
      if ((outLinks.get(node)?.length ?? 0) === 0) {
        dangling += ranks.get(node) ?? 0;
      }
    }
    const next = new Map<string, number>();
    for (const node of nodes) {
      let sum = 0;
      for (const source of inLinks.get(node) ?? []) {
        const outDegree = outLinks.get(source)?.length ?? 0;
        if (outDegree > 0) {
          sum += (ranks.get(source) ?? 0) / outDegree;
        }
      }
      next.set(node, (1 - damping) / count + damping * (dangling / count + sum));
    }
    for (const [node, value] of next) {
      ranks.set(node, value);
    }
  }

  return ranks;
}
