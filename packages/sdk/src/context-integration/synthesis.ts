/**
 * Deterministic synthesis (ADR-017): a computed conclusion + evidence chain
 * derived from the graph, parser, and summaries - NOT AI-generated.
 *
 * The synthesis tier exists because retrieval alone (ranked file excerpts) does
 * not lift weak-model accuracy: a weak model cannot reliably *reason over*
 * raw excerpts the way a frontier model can. So for weak models, the engine
 * reasons about code structure *on the model's behalf* and hands it a
 * conclusion to verify and present, not just raw evidence.
 *
 * Produced only in digest/weak-model mode (assemble.ts); full/frontier
 * mode omits it (the model reasons over ranked items directly). Pure, bounded,
 * deterministic - no AI, no IO beyond the already-loaded index.
 */
import type { ContextTaskCategory } from "@atlas/core";
import type { FilePath, Result } from "@atlas/shared";
import { ok } from "@atlas/shared";
import type { RelevantContext } from "../context/models";
import type { ContextSDK } from "../context/sdk";
import type { ContextSynthesis } from "./models";

export interface SynthesisInput {
  readonly context: ContextSDK;
  readonly task: string;
  readonly category: ContextTaskCategory;
}

const MAX_EVIDENCE = 6;
const MAX_CENTRAL_FILES = 5;

export function synthesize(input: SynthesisInput): Result<ContextSynthesis | undefined> {
  const { context, task, category } = input;
  if (!context.isAvailable) {
    return ok(undefined);
  }
  const relevant = context.getRelevantContext(task);
  switch (category) {
    case "architecture":
      return ok(synthesizeDependencyPath(task, relevant, context));
    case "debug":
      return ok(synthesizeFaultSite(task, relevant, context));
    default:
      return ok(synthesizeModuleMap(task, relevant));
  }
}

function synthesizeDependencyPath(
  task: string,
  relevant: RelevantContext,
  context: ContextSDK,
): ContextSynthesis | undefined {
  const about = pickTargetFiles(task, relevant, 2);
  const evidence: string[] = [];
  const centralFiles = [...about];
  if (about.length >= 2) {
    evidence.push(`Primary entities: ${about[0]} and ${about[1]} (from task + ranked hits).`);
    const path = shortestDependencyPath(about[0], about[1], context);
    if (path !== null) {
      evidence.push(`Dependency path (${path.length} files): ${path.join(" -> ")}.`);
      centralFiles.push(...path);
    } else {
      evidence.push(
        "No direct dependency path found between the two files; treating them as independent modules.",
      );
    }
  } else if (about.length === 1) {
    evidence.push(`Primary entity: ${about[0]} (from task + ranked hits).`);
  }
  if (evidence.length === 0) {
    return undefined;
  }
  const conclusion =
    about.length >= 2
      ? `The dependency path between ${about[0]} and ${about[1]} is: ${centralFiles.slice(0, MAX_CENTRAL_FILES).join(" -> ")} — verify each edge.`
      : `Context for ${about[0]} is gathered from the dependency graph and summaries.`;
  return {
    kind: "dependency-path",
    conclusion,
    evidence: evidence.slice(0, MAX_EVIDENCE),
    centralFiles: centralFiles.slice(0, MAX_CENTRAL_FILES),
  };
}

/**
 * Deterministic shortest path (BFS) between two files in the dependency graph,
 * using both directions of each edge (a file that imports B is related to B
 * whether the path goes A -> ... -> B or B -> ... -> A). Returns `null` when no
 * path exists. Pure, bounded, no AI.
 */
function shortestDependencyPath(from: string, to: string, context: ContextSDK): string[] | null {
  if (from === to) {
    return [from];
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of context.dependencies.getDependencyGraph()) {
    for (const [a, b] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ] as const) {
      const list = adjacency.get(a) ?? [];
      list.push(b);
      adjacency.set(a, list);
    }
  }
  const prev = new Map<string, string>();
  const visited = new Set<string>([from]);
  const queue: string[] = [from];
  let found = false;
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === to) {
      found = true;
      break;
    }
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        prev.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }
  if (!found) {
    return null;
  }
  const path: string[] = [];
  let cursor: string | undefined = to;
  while (cursor !== undefined) {
    path.unshift(cursor);
    cursor = prev.get(cursor);
  }
  return path;
}

function synthesizeFaultSite(
  task: string,
  relevant: RelevantContext,
  context: ContextSDK,
): ContextSynthesis | undefined {
  const ranked = relevant.files.map((f) => f.path).filter((p): p is FilePath => p !== null);
  const evidence: string[] = [];
  evidence.push(`Bug signals in task matched against ${ranked.length} ranked files.`);
  const fault = pickTargetFiles(task, relevant, 1)[0];
  const centralFiles: string[] = [];
  if (fault) {
    centralFiles.push(fault);
    evidence.push(`Likely fault site: ${fault} (best match to bug signals).`);
    const callers = filesCallingInto(fault, context).slice(0, 3);
    if (callers.length > 0) {
      evidence.push(`Reached by: ${callers.join(", ")} (incoming call/import edges).`);
      centralFiles.push(...callers);
    }
  }
  if (centralFiles.length === 0) {
    return undefined;
  }
  return {
    kind: "fault-site",
    conclusion: `The most likely fault site is ${centralFiles[0]}; verify the failure path through its callers.`,
    evidence: evidence.slice(0, MAX_EVIDENCE),
    centralFiles: centralFiles.slice(0, MAX_CENTRAL_FILES),
  };
}

function synthesizeModuleMap(
  task: string,
  relevant: RelevantContext,
): ContextSynthesis | undefined {
  const ranked = relevant.files.map((f) => f.path).filter((p): p is FilePath => p !== null);
  const summaries = relevant.summaries.filter((s) => s.target !== null).slice(0, 4);
  const evidence: string[] = [];
  const centralFiles = [...ranked.slice(0, MAX_CENTRAL_FILES)];
  evidence.push(`Task matched ${ranked.length} files and ${relevant.symbols.length} symbols.`);
  if (summaries.length > 0) {
    evidence.push(
      `Summarized modules: ${summaries
        .map((s) => s.target)
        .filter((t): t is string => t !== null)
        .join(", ")}.`,
    );
  }
  if (evidence.length === 0) {
    return undefined;
  }
  const about = pickTargetFiles(task, relevant, 2);
  const conclusion =
    about.length > 0
      ? `The task centers on ${about.join(" and ")}; the key modules and their roles are mapped below.`
      : "The relevant modules and their roles are mapped below.";
  return {
    kind: "module-map",
    conclusion,
    evidence: evidence.slice(0, MAX_EVIDENCE),
    centralFiles: centralFiles.slice(0, MAX_CENTRAL_FILES),
  };
}

function pickTargetFiles(task: string, relevant: RelevantContext, n: number): string[] {
  const out: string[] = [];
  const ranked = relevant.files.map((f) => f.path).filter((p): p is FilePath => p !== null);
  for (const word of task.split(/\s+/)) {
    if (/\.[a-z]{1,4}$/i.test(word) && ranked.includes(word as FilePath)) {
      out.push(word);
    }
  }
  for (const p of ranked) {
    if (out.length >= n) break;
    if (!out.includes(p)) out.push(p);
  }
  return out.slice(0, n);
}

function filesCallingInto(target: string, context: ContextSDK): string[] {
  const result: string[] = [];
  for (const edge of context.dependencies.getDependencyGraph()) {
    if (edge.to === target && edge.from !== target) result.push(edge.from);
    if (result.length >= 5) break;
  }
  return result;
}
