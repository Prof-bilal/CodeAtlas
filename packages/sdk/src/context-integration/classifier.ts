/**
 * Deterministic task classifier (Phase 2, P2.2 — small-model intelligence
 * execution plan; ADR-015, ADR-016).
 *
 * Classifies a raw task string into a `ContextTaskCategory` + subcategory
 * with a confidence score, using keyword scoring and graph signals. Pure,
 * deterministic, no AI, no IO — the same task text always yields the same
 * classification.
 *
 * A model-refinement hook is stubbed: when a `ProviderPort` is supplied,
 * the classifier may optionally ask the model to refine the subcategory,
 * but the default path is entirely rule-based.
 */

import type { ContextTaskCategory, TaskClassification } from "@atlas/core";
import { extractTaskEntities } from "./entities";

// ── Keyword patterns per category ──────────────────────────────────────────

interface CategoryPattern {
  readonly category: ContextTaskCategory;
  readonly keywords: readonly string[];
  readonly patterns: readonly RegExp[];
  readonly weight: number;
}

const CATEGORY_PATTERNS: readonly CategoryPattern[] = [
  {
    category: "debug",
    weight: 1.0,
    keywords: [
      "bug",
      "fix",
      "error",
      "crash",
      "failing",
      "fails",
      "failed",
      "broken",
      "issue",
      "problem",
      "regression",
      "exception",
      "traceback",
      "stack trace",
      "undefined",
      "null",
      "nan",
      " TypeError",
      " ReferenceError",
      "syntax error",
      "segmentation",
      "panic",
      "oops",
      "wrong",
      "incorrect",
      "unexpected",
      "cannot",
      "can't",
      "doesn't work",
      "not working",
      "broken",
      "hang",
      "freeze",
      "timeout",
      "deadlock",
      "race condition",
      "leak",
      "overflow",
    ],
    patterns: [
      /\b(fix|bug|error|crash|fail|broken|issue|problem|regression)\b/i,
      /\b(exception|traceback|stack\s*trace)\b/i,
      /\b(undefined|null|nan)\b.*\b(error|wrong|unexpected)\b/i,
      /\b(type\s*error|reference\s*error|syntax\s*error)\b/i,
      /\b(hang|freeze|timeout|deadlock|race\s*condition|leak|overflow)\b/i,
      /\b(doesn't\s+work|not\s+working|can't\s+(?:connect|load|parse|run))\b/i,
      /\b(wrong|incorrect|unexpected)\s+(?:result|output|behavior|value)\b/i,
    ],
  },
  {
    category: "security",
    weight: 1.0,
    keywords: [
      "security",
      "vulnerability",
      "vulnerabilities",
      "cve",
      "exploit",
      "injection",
      "xss",
      "csrf",
      "ssrf",
      "auth",
      "authentication",
      "authorization",
      "permission",
      "permissions",
      "access control",
      "secret",
      "secrets",
      "token",
      "credential",
      "credentials",
      "password",
      "encrypt",
      "encryption",
      "decrypt",
      "hash",
      "salt",
      "csrf",
      "sanitize",
      "validate",
      "trust",
      "privilege",
      "escalation",
      "audit",
      "compliance",
      "tls",
      "ssl",
      "https",
      "cors",
      "origin",
    ],
    patterns: [
      /\b(security|vulnerability|vulnerabilities|cve|exploit)\b/i,
      /\b(injection|xss|csrf|ssrf)\b/i,
      /\b(auth|authentication|authorization|access\s*control)\b/i,
      /\b(permission|permissions|privilege|escalation)\b/i,
      /\b(secret|secrets?|token|credential|credentials?|password)\b/i,
      /\b(encrypt|encryption|decrypt|hash|salt)\b/i,
      /\b(sanitize|validate|trust|audit|compliance)\b/i,
      /\b(tls|ssl|https|cors|origin)\b/i,
    ],
  },
  {
    category: "architecture",
    weight: 0.9,
    keywords: [
      "architecture",
      "design",
      "structure",
      "organize",
      "refactor",
      "restructure",
      "reorganize",
      "module",
      "modules",
      "package",
      "packages",
      "dependency",
      "dependencies",
      "circular",
      "coupling",
      "cohesion",
      "separation",
      "abstraction",
      "layer",
      "layers",
      "port",
      "adapter",
      "pattern",
      "clean",
      "solid",
      "dry",
      "kiss",
      "boundary",
      "interface",
      "contract",
      "extens",
      "plugin",
      "middleware",
      "pipeline",
      "workflow",
    ],
    patterns: [
      /\b(architecture|design|structure|organize|refactor|restructure|reorganize)\b/i,
      /\b(module|modules|package|packages)\b.*\b(structure|organize|split|merge|boundary)\b/i,
      /\b(dependenc|circular|coupling|cohesion)\b/i,
      /\b(separation\s+of\s+concerns|abstraction|layer|layers)\b/i,
      /\b(port|adapter|pattern|clean|solid|dry|kiss)\b/i,
      /\b(extens|plugin|middleware|pipeline|workflow)\b/i,
      /\b(interface|contract)\b.*\b(define|create|extract|establish)\b/i,
    ],
  },
  {
    category: "understand",
    weight: 0.8,
    keywords: [
      "explain",
      "understand",
      "how",
      "what",
      "why",
      "where",
      "describe",
      "overview",
      "summary",
      "document",
      "documentation",
      "readme",
      "guide",
      "tutorial",
      "walkthrough",
      "diagram",
      "flow",
      "mapping",
      "relationship",
      "dependency graph",
      "call graph",
      "entry point",
      "entry points",
      "surface",
      "api",
      "endpoint",
      "route",
      "handler",
    ],
    patterns: [
      /\b(explain|understand|describe|overview|summary)\b/i,
      /\b(how|what|why|where)\s+(?:does|do|is|are|was|were|has|have|can|should|would)\b/i,
      /\b(document|documentation|readme|guide|tutorial|walkthrough)\b/i,
      /\b(diagram|flow|mapping|relationship)\b/i,
      /\b(dependency\s*graph|call\s*graph|entry\s*point|entry\s*points)\b/i,
      /\b(surface|api|endpoint|route|handler)\b.*\b(what|where|how|list|find)\b/i,
    ],
  },
];

// ── Subcategory heuristics ─────────────────────────────────────────────────

interface SubcategoryRule {
  readonly category: ContextTaskCategory;
  readonly subcategory: string;
  readonly keywords: readonly string[];
  readonly patterns: readonly RegExp[];
}

const SUBCATEGORY_RULES: readonly SubcategoryRule[] = [
  // Debug subcategories
  {
    category: "debug",
    subcategory: "auth-bug",
    keywords: ["auth", "login", "session", "token", "permission"],
    patterns: [/\b(auth|login|session|token|permission)\b/i],
  },
  {
    category: "debug",
    subcategory: "api-bug",
    keywords: ["api", "endpoint", "route", "request", "response", "http", "fetch"],
    patterns: [/\b(api|endpoint|route|request|response|http|fetch)\b/i],
  },
  {
    category: "debug",
    subcategory: "data-bug",
    keywords: ["data", "database", "query", "sql", "migration", "schema", "store"],
    patterns: [/\b(data|database|query|sql|migration|schema|store)\b/i],
  },
  {
    category: "debug",
    subcategory: "type-bug",
    keywords: ["type", "typescript", "compile", "compilation", "typecheck"],
    patterns: [/\b(type|typescript|compile|compilation|typecheck)\b/i],
  },
  {
    category: "debug",
    subcategory: "test-bug",
    keywords: ["test", "tests", "testing", "vitest", "jest", "assertion", "expect"],
    patterns: [/\b(test|tests|testing|vitest|jest|assertion|expect)\b/i],
  },
  {
    category: "debug",
    subcategory: "perf-bug",
    keywords: ["performance", "slow", "memory", "cpu", "latency", "optimization"],
    patterns: [/\b(performance|slow|memory|cpu|latency|optimization)\b/i],
  },
  {
    category: "debug",
    subcategory: "ui-bug",
    keywords: ["ui", "render", "display", "css", "style", "layout", "component"],
    patterns: [/\b(ui|render|display|css|style|layout|component)\b/i],
  },

  // Feature subcategories
  {
    category: "architecture",
    subcategory: "api-feature",
    keywords: ["api", "endpoint", "route", "handler", "controller"],
    patterns: [/\b(api|endpoint|route|handler|controller)\b/i],
  },
  {
    category: "architecture",
    subcategory: "auth-feature",
    keywords: ["auth", "login", "session", "permission", "rbac"],
    patterns: [/\b(auth|login|session|permission|rbac)\b/i],
  },
  {
    category: "architecture",
    subcategory: "data-feature",
    keywords: ["database", "query", "migration", "schema", "model"],
    patterns: [/\b(database|query|migration|schema|model)\b/i],
  },
  {
    category: "architecture",
    subcategory: "config-feature",
    keywords: ["config", "configuration", "settings", "env", "environment"],
    patterns: [/\b(config|configuration|settings|env|environment)\b/i],
  },
  {
    category: "architecture",
    subcategory: "cli-feature",
    keywords: ["cli", "command", "subcommand", "argument", "flag"],
    patterns: [/\b(cli|command|subcommand|argument|flag)\b/i],
  },
];

// ── Scoring ────────────────────────────────────────────────────────────────

function scoreCategory(text: string, pattern: CategoryPattern): number {
  let score = 0;
  const lower = text.toLowerCase();
  for (const keyword of pattern.keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      score += 1;
    }
  }
  for (const regex of pattern.patterns) {
    if (regex.test(text)) {
      score += 2; // regex matches are stronger signals
    }
  }
  return score * pattern.weight;
}

function pickSubcategory(text: string, category: ContextTaskCategory): string {
  let best: string = category;
  let bestScore = 0;
  for (const rule of SUBCATEGORY_RULES) {
    if (rule.category !== category) {
      continue;
    }
    let score = 0;
    const lower = text.toLowerCase();
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    for (const regex of rule.patterns) {
      if (regex.test(text)) {
        score += 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule.subcategory;
    }
  }
  return best;
}

function computeConfidence(scores: ReadonlyMap<ContextTaskCategory, number>): number {
  const sorted = [...scores.values()].sort((a, b) => b - a);
  if (sorted.length === 0) {
    return 0;
  }
  const top = sorted[0] ?? 0;
  const runnerUp = sorted[1] ?? 0;
  if (top === 0) {
    return 0;
  }
  // Confidence = how much the top score dominates the runner-up.
  // If top is 10 and runner-up is 2, confidence is high (~0.8).
  // If top is 3 and runner-up is 2, confidence is low (~0.5).
  const margin = top - runnerUp;
  const confidence = Math.min(1, 0.5 + margin / (top + 1));
  return Math.round(confidence * 100) / 100;
}

function buildReasoning(
  category: ContextTaskCategory,
  subcategory: string,
  confidence: number,
  topKeywords: readonly string[],
): string {
  const parts = [
    `Classified as "${category}" (subcategory: "${subcategory}") with confidence ${confidence}.`,
  ];
  if (topKeywords.length > 0) {
    parts.push(`Key signals: ${topKeywords.slice(0, 5).join(", ")}.`);
  }
  return parts.join(" ");
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a deterministic task classifier.
 *
 * The returned function classifies a task string into a category +
 * subcategory with a confidence score. Pure, no AI, no IO.
 *
 * The optional `_provider` parameter is a stub for future model refinement:
 * when supplied, the classifier *could* ask the model to refine the
 * subcategory. Today it is ignored — the classification is entirely
 * rule-based.
 */
export function createClassifier(_provider?: unknown): (task: string) => TaskClassification {
  return (task: string): TaskClassification => {
    const text = task.length > 4000 ? task.slice(0, 4000) : task;
    const entities = extractTaskEntities(text);

    // Score each category.
    const scores = new Map<ContextTaskCategory, number>();
    for (const pattern of CATEGORY_PATTERNS) {
      scores.set(pattern.category, scoreCategory(text, pattern));
    }

    // Pick the highest-scoring category; default to "understand" on tie.
    let bestCategory: ContextTaskCategory = "understand";
    let bestScore = 0;
    for (const [category, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    // If no signals matched at all, default to "understand" with low confidence.
    if (bestScore === 0) {
      return {
        category: "understand",
        subcategory: "general",
        confidence: 0.2,
        reasoning:
          'No strong category signals detected; defaulting to "understand" with low confidence.',
        entities,
      };
    }

    const subcategory = pickSubcategory(text, bestCategory);
    const confidence = computeConfidence(scores);

    // Collect the top keywords that contributed to the winning category.
    const winningPattern = CATEGORY_PATTERNS.find((p) => p.category === bestCategory);
    const lower = text.toLowerCase();
    const topKeywords = (winningPattern?.keywords ?? []).filter((kw) =>
      lower.includes(kw.toLowerCase()),
    );

    return {
      category: bestCategory,
      subcategory,
      confidence,
      reasoning: buildReasoning(bestCategory, subcategory, confidence, topKeywords),
      entities,
    };
  };
}
