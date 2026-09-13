import { existsSync } from "node:fs";
import { createContextSDK } from "@atlas/sdk";
import type { Command } from "commander";
import { contextDbPath, resolveProjectRoot } from "./search";

interface ImpactOptions {
  readonly json?: boolean;
  readonly maxDepth?: string;
  readonly noTests?: boolean;
  readonly noDocs?: boolean;
  readonly breaking?: boolean;
}

interface AffectedFileRow {
  readonly path: string;
  readonly distance: number;
  readonly isTestFile: boolean;
  readonly isDocFile: boolean;
}

interface ImpactReport {
  readonly subjects: readonly string[];
  readonly affected: readonly AffectedFileRow[];
  readonly risk: {
    readonly level: "low" | "medium" | "high";
    readonly directDependents: number;
    readonly totalAffected: number;
    readonly affectedTests: number;
    readonly affectedDocs: number;
    readonly fanOutRatio: number;
  };
  readonly durationMs: number;
}

const TEST_PATH_RE = /[/\\](tests?|specs?)[/\\]|\.test\.[^.]+$|\.spec\.[^.]+$/i;
const DOC_PATH_RE = /\.(md|mdx|rst|txt)$/i;

/** BFS reverse-dependency walk using the ContextSDK's getDependents(). */
async function analyzeImpact(
  sdk: ReturnType<typeof createContextSDK>,
  subjects: readonly string[],
  opts: { maxDepth: number; includeTests: boolean; includeDocs: boolean },
): Promise<ImpactReport> {
  const start = Date.now();
  const visited = new Map<string, number>(); // path -> distance
  const queue: Array<{ path: string; distance: number }> = [];

  // Seed with subjects (distance 0)
  for (const p of subjects) {
    if (!visited.has(p)) {
      visited.set(p, 0);
      queue.push({ path: p, distance: 0 });
    }
  }

  const affected: AffectedFileRow[] = [];

  while (queue.length > 0) {
    const shifted = queue.shift();
    if (shifted === undefined) continue;
    const { path: current, distance } = shifted;
    if (opts.maxDepth > 0 && distance >= opts.maxDepth) continue;

    let dependents: readonly { from: string; to: string }[] = [];
    try {
      // getDependents returns edges where `to` === current (things that depend on it)
      dependents = sdk.dependencies.getDependents(current);
    } catch {
      continue;
    }

    for (const edge of dependents) {
      const depPath = edge.from;
      if (visited.has(depPath)) continue;

      const nextDistance = distance + 1;
      visited.set(depPath, nextDistance);

      const isTestFile = TEST_PATH_RE.test(depPath);
      const isDocFile = DOC_PATH_RE.test(depPath);

      if (!opts.includeTests && isTestFile) continue;
      if (!opts.includeDocs && isDocFile) continue;

      affected.push({ path: depPath, distance: nextDistance, isTestFile, isDocFile });
      queue.push({ path: depPath, distance: nextDistance });
    }
  }

  const directDependents = affected.filter((n) => n.distance === 1).length;
  const affectedTests = affected.filter((n) => n.isTestFile).length;
  const affectedDocs = affected.filter((n) => n.isDocFile).length;
  const totalNodes = Math.max(visited.size, 1);
  const fanOutRatio = affected.length / totalNodes;

  const level: "low" | "medium" | "high" =
    fanOutRatio >= 0.2 ? "high" : fanOutRatio >= 0.05 ? "medium" : "low";

  return {
    subjects,
    affected,
    risk: {
      level,
      directDependents,
      totalAffected: affected.length,
      affectedTests,
      affectedDocs,
      fanOutRatio,
    },
    durationMs: Date.now() - start,
  };
}

export function registerImpact(program: Command): void {
  program
    .command("impact <paths...>")
    .description(
      "Compute the blast radius of changed files: reverse-dependency closure, affected tests, and risk score",
    )
    .option("--max-depth <n>", "Maximum traversal depth (0 = unlimited)", "0")
    .option("--no-tests", "Exclude test files from results")
    .option("--no-docs", "Exclude documentation files from results")
    .option("--breaking", "Include breaking-change summary (export surface diff vs last snapshot)")
    .option("--json", "Output as JSON")
    .action(async (paths: string[], opts: ImpactOptions) => {
      const cwd = resolveProjectRoot();
      const dbPath = contextDbPath(cwd);

      if (!existsSync(dbPath)) {
        console.error("No context index found. Run 'atlas init' or 'atlas build' first.");
        process.exit(1);
      }

      const sdk = createContextSDK({ dbPath, repositoryPath: cwd });

      const report = await analyzeImpact(sdk, paths, {
        maxDepth: opts.maxDepth !== undefined ? Number.parseInt(opts.maxDepth, 10) : 0,
        includeTests: opts.noTests !== true,
        includeDocs: opts.noDocs !== true,
      });

      if (opts.json === true) {
        console.log(JSON.stringify(report, null, 2));
        process.exit(report.risk.level === "high" ? 1 : 0);
        return;
      }

      // Human-readable output
      const riskIcon =
        report.risk.level === "high" ? "🔴" : report.risk.level === "medium" ? "🟡" : "🟢";

      console.log("\n## Impact Analysis\n");
      console.log(`Subjects: ${report.subjects.join(", ")}`);
      console.log(`Duration: ${report.durationMs}ms\n`);

      console.log(
        `${riskIcon} Risk: ${report.risk.level.toUpperCase()} ` +
          `(fan-out ${(report.risk.fanOutRatio * 100).toFixed(1)}%)`,
      );
      console.log(`  Direct dependents : ${report.risk.directDependents}`);
      console.log(`  Total affected    : ${report.risk.totalAffected}`);
      console.log(`  Affected tests    : ${report.risk.affectedTests}`);
      console.log(`  Affected docs     : ${report.risk.affectedDocs}`);

      if (report.affected.length > 0) {
        console.log("\nAffected files (by distance):\n");
        const sorted = [...report.affected].sort((a, b) => a.distance - b.distance);
        for (const node of sorted.slice(0, 50)) {
          const tag = node.isTestFile ? " [test]" : node.isDocFile ? " [doc]" : "";
          console.log(`  [+${node.distance}] ${node.path}${tag}`);
        }
        if (sorted.length > 50) {
          console.log(`  ... and ${sorted.length - 50} more`);
        }
      } else {
        console.log("\nNo dependents found for the given subjects.");
      }

      if (opts.breaking === true) {
        console.log(
          "\nBreaking-change check: snapshot diff is not yet implemented (--breaking is a P1 feature).",
        );
      }

      process.exit(report.risk.level === "high" ? 1 : 0);
    });
}
