/**
 * Deterministic task planner (Phase 2, P2.3 — small-model intelligence
 * execution plan; ADR-015, ADR-016).
 *
 * Produces a structured `TaskPlan` from a classifier's output + context
 * search + dependency closure. Pure, deterministic, no AI, no IO — the
 * same classification + context always yields the same plan.
 *
 * The planner composes:
 * 1. Entity extraction (P1.2) for explicit file/symbol targets.
 * 2. Search results to identify relevant code.
 * 3. Dependency closure to expand the impact set.
 * 4. Category-specific heuristics to determine steps and verification.
 */

import type {
  ContextPlan,
  ContextTaskCategory,
  PlanStep,
  PlannerPort,
  TaskClassification,
  VerificationStrategy,
} from "@atlas/core";
import type { ContextSDK } from "../context/sdk";

// ── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of plan steps (bounded, deterministic). */
const MAX_STEPS = 8;
/** Maximum impact set size. */
const MAX_IMPACT_SET = 15;
/** Maximum unknowns. */
const MAX_UNKNOWNS = 5;
/** Hop limit for dependency closure. */
const CLOSED_HOPS = 1;

// ── Category → step templates ──────────────────────────────────────────────

interface StepTemplate {
  readonly action: string;
  readonly rationale: string;
  readonly verification: VerificationStrategy;
}

const CATEGORY_TEMPLATES: ReadonlyMap<ContextTaskCategory, readonly StepTemplate[]> = new Map([
  [
    "debug",
    [
      {
        action: "Identify the failing behavior and reproduce the error",
        rationale: "Understanding the exact failure is prerequisite to any fix.",
        verification: "none",
      },
      {
        action: "Locate the source files involved in the error path",
        rationale: "The bug lives in specific code; finding the right files narrows the search.",
        verification: "claim-checks",
      },
      {
        action: "Read the relevant code and trace the root cause",
        rationale: "Tracing the execution path reveals the actual defect.",
        verification: "none",
      },
      {
        action: "Implement the fix with minimal side effects",
        rationale: "A targeted fix avoids regressions.",
        verification: "command-runners",
      },
      {
        action: "Verify the fix resolves the original error",
        rationale: "Confirm the fix works before declaring done.",
        verification: "command-runners",
      },
    ],
  ],
  [
    "security",
    [
      {
        action: "Identify the security surface and threat model",
        rationale: "Understanding what is exposed and what is at risk.",
        verification: "none",
      },
      {
        action: "Locate authentication, authorization, and input-handling code",
        rationale: "Security issues concentrate in trust boundaries.",
        verification: "claim-checks",
      },
      {
        action: "Review the code for known vulnerability patterns",
        rationale: "Systematic review catches injection, XSS, CSRF, and privilege issues.",
        verification: "none",
      },
      {
        action: "Implement mitigations with defense-in-depth",
        rationale: "Layered defenses reduce blast radius.",
        verification: "command-runners",
      },
      {
        action: "Verify mitigations with security-focused tests",
        rationale: "Tests confirm the vulnerability is closed.",
        verification: "command-runners",
      },
    ],
  ],
  [
    "architecture",
    [
      {
        action: "Map the current module structure and dependency flow",
        rationale: "You cannot reorganize what you do not understand.",
        verification: "none",
      },
      {
        action: "Identify the target structure and the boundary changes",
        rationale: "Defines where to split, merge, or rewire.",
        verification: "none",
      },
      {
        action: "Refactor interfaces and ports to match the target structure",
        rationale: "Clean boundaries are the foundation of good architecture.",
        verification: "command-runners",
      },
      {
        action: "Update imports and dependencies to reflect the new structure",
        rationale: " callers must adopt the new interfaces.",
        verification: "command-runners",
      },
      {
        action: "Verify no circular dependencies remain",
        rationale: "Circular deps are a primary architecture smell.",
        verification: "command-runners",
      },
    ],
  ],
  [
    "understand",
    [
      {
        action: "Locate the entry points and core abstractions",
        rationale: "Understanding starts at the boundaries and works inward.",
        verification: "none",
      },
      {
        action: "Trace the data flow and key interactions",
        rationale: "Following the flow reveals how the system actually works.",
        verification: "none",
      },
      {
        action: "Summarize the architecture and key design decisions",
        rationale: "A structured summary gives the model (and user) a mental model.",
        verification: "none",
      },
    ],
  ],
]);

// ── Helpers ────────────────────────────────────────────────────────────────

function dedupeStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    const key = v.replace(/\\/g, "/").toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(v);
    }
  }
  return result;
}

function extractFilePathsFromSearch(
  context: ContextSDK,
  task: string,
  limit: number,
): readonly string[] {
  const hits = context.search.search(task, {
    types: ["file", "symbol"],
    limit,
  });
  const paths: string[] = [];
  for (const hit of hits) {
    if (hit.path !== null) {
      paths.push(hit.path);
    }
  }
  return dedupeStrings(paths);
}

function expandImpactViaClosure(
  context: ContextSDK,
  seedPaths: readonly string[],
): readonly string[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of context.dependencies.getDependencyGraph()) {
    const fromList = adjacency.get(edge.from) ?? [];
    fromList.push(edge.to);
    adjacency.set(edge.from, fromList);
    const toList = adjacency.get(edge.to) ?? [];
    toList.push(edge.from);
    adjacency.set(edge.to, toList);
  }

  const filePrefix = "n:file:";
  const visited = new Set<string>();
  let frontier = seedPaths.map((p) => `${filePrefix}${p.replace(/\\/g, "/")}`);
  for (const id of frontier) {
    visited.add(id);
  }

  for (let hop = 0; hop < CLOSED_HOPS && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        if (neighbor.startsWith(filePrefix)) {
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  const result: string[] = [];
  for (const nodeId of visited) {
    if (nodeId.startsWith(filePrefix)) {
      const path = nodeId.slice(filePrefix.length).replace(/\//g, "\\");
      result.push(path);
    }
  }
  return result;
}

function detectUnknowns(
  task: string,
  classification: TaskClassification,
  impactSet: readonly string[],
): readonly string[] {
  const unknowns: string[] = [];

  // Unknown 1: Task mentions entities not in the impact set.
  for (const symbol of classification.entities.symbolNames) {
    if (!impactSet.some((p) => p.toLowerCase().includes(symbol.toLowerCase()))) {
      unknowns.push(`Symbol "${symbol}" is referenced but not found in indexed files.`);
      if (unknowns.length >= MAX_UNKNOWNS) break;
    }
  }

  // Unknown 2: Task has low confidence.
  if (classification.confidence < 0.4) {
    unknowns.push("Low classification confidence — the task may be ambiguous or multi-faceted.");
  }

  // Unknown 3: Multi-file task with small impact set.
  if (impactSet.length <= 1 && task.length > 50) {
    unknowns.push("The task is detailed but the impact set is small — may need broader context.");
  }

  return unknowns.slice(0, MAX_UNKNOWNS);
}

function verificationForCategory(category: ContextTaskCategory): VerificationStrategy {
  switch (category) {
    case "debug":
    case "security":
      return "command-runners";
    case "architecture":
      return "command-runners";
    case "understand":
      return "claim-checks";
  }
}

function buildSteps(
  category: ContextTaskCategory,
  impactSet: readonly string[],
): readonly PlanStep[] {
  const templates = CATEGORY_TEMPLATES.get(category) ?? CATEGORY_TEMPLATES.get("understand") ?? [];
  const steps: PlanStep[] = [];
  for (let i = 0; i < Math.min(templates.length, MAX_STEPS); i++) {
    const template = templates[i];
    if (template === undefined) continue;
    // Distribute impact set across steps: each step gets a subset of files
    // that are likely relevant to that step's action.
    const filesPerStep = Math.max(1, Math.ceil(impactSet.length / templates.length));
    const startIdx = i * filesPerStep;
    const targetFiles = impactSet.slice(startIdx, startIdx + filesPerStep);
    steps.push({
      order: i + 1,
      action: template.action,
      targetFiles,
      rationale: template.rationale,
    });
  }
  return steps;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a deterministic task planner bound to a `ContextSDK`.
 *
 * The returned function generates a `TaskPlan` from a task string and its
 * classification. It uses the SDK's search and dependency graph to build
 * the impact set, and category-specific heuristics to generate steps.
 *
 * @param context - The ContextSDK providing search and dependency data.
 * @returns A planner function `(task, classification) => ContextPlan`.
 */
export function createPlanner(context: ContextSDK): PlannerPort {
  return {
    plan(task: string, classification: TaskClassification): ContextPlan {
      // 1. Collect seed files from search.
      const seedPaths = extractFilePathsFromSearch(context, task, 20);

      // 2. Expand via dependency closure.
      const closedPaths = expandImpactViaClosure(context, seedPaths);

      // 3. Merge with entity-extracted paths.
      const allPaths = dedupeStrings([...closedPaths, ...classification.entities.filePaths]);

      // 4. Trim to MAX_IMPACT_SET.
      const impactSet = allPaths.slice(0, MAX_IMPACT_SET);

      // 5. Generate steps from category template.
      const steps = buildSteps(classification.category, impactSet);

      // 6. Detect unknowns.
      const unknowns = detectUnknowns(task, classification, impactSet);

      // 7. Determine verification strategy.
      const verificationStrategy =
        impactSet.length > 0 ? verificationForCategory(classification.category) : "none";

      return { steps, impactSet, unknowns, verificationStrategy };
    },
  };
}
