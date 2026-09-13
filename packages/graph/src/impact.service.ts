import type {
  AffectedNode,
  GraphPort,
  ImpactOptions,
  ImpactPort,
  ImpactResult,
  ImpactRiskScore,
  ImpactSubject,
} from "@atlas/core";
import { type FilePath, type NodeId, type Result, fail, ok } from "@atlas/shared";
import { fileNodeId } from "./ids";

const TEST_PATH_RE = /[/\\](tests?|specs?)[/\\]|\.test\.[^.]+$|\.spec\.[^.]+$/i;
const DOC_PATH_RE = /\.(md|mdx|rst|txt)$/i;

const FILE_NODE_PREFIX = "n:file:";

/**
 * Extract a repo-relative file path from a graph node.
 *
 * - File nodes:   id   = "n:file:{path}", symbolId = null → strip prefix
 * - Symbol nodes: symbolId = "{filePath}#{name}@{line}:{col}" → slice before `#`
 */
function pathFromNode(id: NodeId, symbolIdStr: string | null): string {
  if (symbolIdStr === null) {
    const raw = id as string;
    return raw.startsWith(FILE_NODE_PREFIX) ? raw.slice(FILE_NODE_PREFIX.length) : raw;
  }
  const hashIdx = symbolIdStr.indexOf("#");
  return hashIdx >= 0 ? symbolIdStr.slice(0, hashIdx) : symbolIdStr;
}

/**
 * Extract the symbol name from a symbolId string.
 * symbolId format: "{filePath}#{name}@{startLine}:{startColumn}"
 * Returns null for file nodes (symbolId is null) or when the format is unexpected.
 */
function nameFromSymbolId(symbolIdStr: string | null): string | null {
  if (symbolIdStr === null) return null;
  const hashIdx = symbolIdStr.indexOf("#");
  if (hashIdx < 0) return null;
  const afterHash = symbolIdStr.slice(hashIdx + 1); // "{name}@{line}:{col}"
  const atIdx = afterHash.indexOf("@");
  return atIdx >= 0 ? afterHash.slice(0, atIdx) : afterHash;
}

/**
 * Computes the blast radius of a change set via a BFS reverse-dependency walk
 * on the code graph. Deterministic — no AI involved.
 */
export class ImpactService implements ImpactPort {
  constructor(private readonly graph: GraphPort) {}

  async analyze(
    subjects: readonly ImpactSubject[],
    options: ImpactOptions = {},
  ): Promise<Result<ImpactResult>> {
    const start = Date.now();
    const maxDepth = options.maxDepth ?? 0; // 0 = unlimited
    const includeTests = options.includeTests ?? true;
    const includeDocs = options.includeDocs ?? true;

    try {
      // Seed the BFS from file nodes corresponding to each subject path.
      const visited = new Map<string, number>(); // nodeId string → distance
      const queue: Array<{ id: NodeId; distance: number }> = [];

      for (const subject of subjects) {
        const seedId = fileNodeId(subject.path as FilePath);
        const key = seedId as string;
        if (!visited.has(key)) {
          visited.set(key, 0);
          queue.push({ id: seedId, distance: 0 });
        }
      }

      const affected: AffectedNode[] = [];

      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) continue;
        // When maxDepth is set, stop expanding from nodes at the depth limit.
        if (maxDepth > 0 && item.distance >= maxDepth) continue;

        const result = await this.graph.getDependents(item.id);
        if (!result.ok) continue;

        for (const node of result.value) {
          const key = node.id as string;
          if (visited.has(key)) continue;

          const nextDistance = item.distance + 1;
          visited.set(key, nextDistance);

          const symbolIdStr = node.symbolId !== null ? (node.symbolId as string) : null;
          const nodePath = pathFromNode(node.id, symbolIdStr);
          const isTestFile = TEST_PATH_RE.test(nodePath);
          const isDocFile = DOC_PATH_RE.test(nodePath);

          // Apply inclusion filters before recording or enqueueing.
          if (!includeTests && isTestFile) continue;
          if (!includeDocs && isDocFile) continue;

          affected.push({
            path: nodePath,
            symbol: nameFromSymbolId(symbolIdStr),
            distance: nextDistance,
            isTestFile,
            isDocFile,
          });

          queue.push({ id: node.id, distance: nextDistance });
        }
      }

      // visited.size includes the seed nodes; use it as the denominator so the
      // ratio stays in [0, 1). A proper total node count would need a graph API
      // not present on GraphPort, so this is the tightest bound available.
      const totalNodes = Math.max(visited.size, 1);
      const directDependents = affected.filter((n) => n.distance === 1).length;
      const affectedTests = affected.filter((n) => n.isTestFile).length;
      const affectedDocs = affected.filter((n) => n.isDocFile).length;
      const fanOutRatio = affected.length / totalNodes;

      const risk: ImpactRiskScore = {
        fanOutRatio,
        directDependents,
        totalAffected: affected.length,
        affectedTests,
        affectedDocs,
        level: fanOutRatio >= 0.2 ? "high" : fanOutRatio >= 0.05 ? "medium" : "low",
      };

      return ok({
        subjects,
        affected,
        risk,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      return fail(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
