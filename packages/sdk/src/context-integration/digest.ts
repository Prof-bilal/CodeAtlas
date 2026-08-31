/**
 * Repository digest generation (Phase 7, P7.1 — small-model intelligence
 * execution plan).
 *
 * A digest is a **deterministic**, provider-free summary of the repository's
 * architecture, entry points, and conventions. It is generated from indexed
 * data (manifest + symbols + dependencies + modules) and stored in the
 * existing `Summaries` table as `kind: "digest"`. Because it is
 * content-hash-cached, unchanged repos never regenerate it.
 *
 * Pure and deterministic: no AI, no IO, same input ⇒ same output.
 */

import type { Summary, SummaryMetadata } from "@atlas/core";

/** Inputs needed to build a digest. All data comes from the index — no IO. */
export interface DigestInput {
  /** Project metadata from `.codeatlas/manifest.json`. */
  readonly manifest: DigestManifest;
  /** Every indexed file (path + language). */
  readonly files: readonly DigestFile[];
  /** Every indexed symbol. */
  readonly symbols: readonly DigestSymbol[];
  /** Every dependency edge. */
  readonly dependencies: readonly DigestEdge[];
  /** Module paths discovered by the indexer. */
  readonly modules: readonly DigestModule[];
}

/** Manifest summary relevant to digest generation. */
export interface DigestManifest {
  readonly name: string;
  readonly languages: readonly string[];
  readonly framework: string | null;
}

/** A file entry for digest computation. */
export interface DigestFile {
  readonly path: string;
  readonly language: string;
}

/** A symbol entry for digest computation. */
export interface DigestSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly filePath: string;
}

/** A dependency edge for digest computation. */
export interface DigestEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: string;
}

/** A module entry for digest computation. */
export interface DigestModule {
  readonly path: string;
  readonly name: string;
}

/** The structured content of a repository digest. */
export interface DigestContent {
  /** Architecture overview: modules, languages, structure. */
  readonly overview: string;
  /** Key points: entry points, conventions, notable patterns. */
  readonly keyPoints: readonly string[];
}

/**
 * Build a deterministic repository digest from indexed data.
 *
 * Returns a `Summary` with `kind: "digest"` that can be stored in the
 * existing summary table and included in context packages.
 */
export function buildDigest(input: DigestInput): Summary {
  const content = computeDigestContent(input);
  const metadata: SummaryMetadata = {
    generatedAt: new Date().toISOString(),
    provider: "deterministic",
    model: "none",
    prompt: null,
    cacheHit: false,
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  return { kind: "digest", target: "", content, metadata };
}

/** Compute the deterministic digest content from indexed data. */
function computeDigestContent(input: DigestInput): DigestContent {
  const overview = buildOverview(input);
  const keyPoints = buildKeyPoints(input);
  return { overview, keyPoints };
}

/** Build the architecture overview string. */
function buildOverview(input: DigestInput): string {
  const { manifest, files, modules } = input;
  const parts: string[] = [];

  parts.push(`${manifest.name} is a ${manifest.languages.join("/")} project`);

  if (manifest.framework !== null) {
    parts.push(`using ${manifest.framework}`);
  }

  parts.push(`with ${files.length} files`);

  if (modules.length > 0) {
    parts.push(`organized into ${modules.length} modules`);
  }

  const languageCounts = countByLanguage(files);
  const langSummary = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang, count]) => `${lang} (${count})`)
    .join(", ");
  if (langSummary.length > 0) {
    parts.push(`Languages: ${langSummary}`);
  }

  return `${parts.join(" ")}.`;
}

/** Build the key points list: entry points, conventions, structure. */
function buildKeyPoints(input: DigestInput): readonly string[] {
  const points: string[] = [];

  // Entry points: files with the most dependents (highest in-degree).
  const entryPoints = findEntryPoints(input);
  if (entryPoints.length > 0) {
    points.push(
      `Entry points: ${entryPoints.map((ep) => `${ep.path} (${ep.dependents} dependents)`).join(", ")}`,
    );
  }

  // Module structure.
  const moduleNames = input.modules.map((m) => m.name).sort();
  if (moduleNames.length > 0) {
    points.push(`Modules: ${moduleNames.join(", ")}`);
  }

  // Test conventions.
  const testPattern = inferTestPattern(input.files);
  if (testPattern !== null) {
    points.push(`Test convention: ${testPattern}`);
  }

  // Naming conventions.
  const namingConvention = inferNamingConvention(input.symbols);
  if (namingConvention !== null) {
    points.push(`Naming convention: ${namingConvention}`);
  }

  // Key exported symbols (top-level, high visibility).
  const keyExports = findKeyExports(input);
  if (keyExports.length > 0) {
    points.push(
      `Key exports: ${keyExports.map((s) => `${s.name} (${s.kind} in ${shortPath(s.filePath)})`).join(", ")}`,
    );
  }

  // Circular dependencies (architectural warning).
  const cycles = findCycles(input);
  if (cycles.length > 0) {
    points.push(`Circular dependencies detected: ${cycles.length} cycle(s)`);
  }

  return points;
}

/**
 * Find entry points: files with the most dependents (highest in-degree in the
 * dependency graph, excluding imports which are structural, not architectural).
 */
function findEntryPoints(
  input: DigestInput,
): readonly { readonly path: string; readonly dependents: number }[] {
  const ARCHITECTURAL_EDGES = new Set([
    "calls",
    "constructs",
    "accesses",
    "reads",
    "writes",
    "extends",
    "implements",
  ]);

  const inDegree = new Map<string, number>();
  for (const edge of input.dependencies) {
    if (!ARCHITECTURAL_EDGES.has(edge.kind)) {
      continue;
    }
    const filePath = symbolIdToFilePath(edge.to, input);
    if (filePath !== null) {
      inDegree.set(filePath, (inDegree.get(filePath) ?? 0) + 1);
    }
  }

  return [...inDegree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, dependents]) => ({ path, dependents }));
}

/**
 * Resolve a symbol/node id to a file path. Graph node ids use the `n:` prefix
 * and file nodes use `n:file:` prefix; symbol nodes reference symbols that
 * carry a `filePath`.
 */
function symbolIdToFilePath(nodeId: string, input: DigestInput): string | null {
  const FILE_PREFIX = "n:file:";
  if (nodeId.startsWith(FILE_PREFIX)) {
    return nodeId.slice(FILE_PREFIX.length);
  }
  // Symbol node: look up in symbols.
  const symbolId = nodeId.startsWith("n:") ? nodeId.slice(2) : nodeId;
  const symbol = input.symbols.find((s) => s.id === symbolId);
  return symbol?.filePath ?? null;
}

/** Infer the test file naming convention. */
function inferTestPattern(files: readonly DigestFile[]): string | null {
  let testInSrc = 0;
  let testInTestDir = 0;
  let testInTestsDir = 0;
  let testIn__tests__ = 0;

  for (const file of files) {
    const name = basename(file.path);
    if (!isTestFile(name)) {
      continue;
    }
    if (file.path.includes("__tests__")) {
      testIn__tests__ += 1;
    } else if (file.path.includes("/test/") || file.path.includes("\\test\\")) {
      testInTestDir += 1;
    } else if (file.path.includes("/tests/") || file.path.includes("\\tests\\")) {
      testInTestsDir += 1;
    } else {
      testInSrc += 1;
    }
  }

  const total = testInSrc + testInTestDir + testInTestsDir + testIn__tests__;
  if (total === 0) {
    return null;
  }

  if (testIn__tests__ > 0 && testIn__tests__ >= total / 2) {
    return "`__tests__/` directories";
  }
  if (testInTestDir > 0 && testInTestDir >= total / 2) {
    return "`test/` directory alongside source";
  }
  if (testInTestsDir > 0 && testInTestsDir >= total / 2) {
    return "`tests/` directory at project root";
  }
  if (testInSrc > 0 && testInSrc >= total / 2) {
    return "`*.test.*` / `*.spec.*` co-located with source";
  }
  return "mixed test locations";
}

/** Check if a filename looks like a test file. */
function isTestFile(name: string): boolean {
  return /\.(test|spec)\.[a-z0-9]+$/i.test(name) || name === "test" || name === "tests";
}

/** Infer the naming convention from symbol names. */
function inferNamingConvention(symbols: readonly DigestSymbol[]): string | null {
  if (symbols.length === 0) {
    return null;
  }

  let camelCase = 0;
  let snakeCase = 0;
  let pascalCase = 0;

  for (const symbol of symbols) {
    const name = symbol.name;
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      pascalCase += 1;
    } else if (/^[a-z][a-zA-Z0-9]*$/.test(name)) {
      camelCase += 1;
    } else if (/^[a-z][a-z0-9_]*$/.test(name)) {
      snakeCase += 1;
    }
  }

  const total = camelCase + snakeCase + pascalCase;
  if (total === 0) {
    return null;
  }

  if (pascalCase > total * 0.4) {
    return "PascalCase for types/classes, camelCase for functions/variables";
  }
  if (snakeCase > total * 0.4) {
    return "snake_case";
  }
  if (camelCase > total * 0.4) {
    return "camelCase";
  }
  return "mixed naming conventions";
}

/** Find key exported symbols (public, top-level). */
function findKeyExports(input: DigestInput): readonly DigestSymbol[] {
  const EXPORT_KINDS = new Set(["function", "class", "interface", "type-alias", "const", "enum"]);

  // Find which files are "export hubs" — files whose symbols are re-exported
  // heavily. A symbol is "key" when it is exported from a file that other
  // files import from.
  const importTargets = new Map<string, number>();
  for (const edge of input.dependencies) {
    if (edge.kind !== "imports") {
      continue;
    }
    const targetFile = symbolIdToFilePath(edge.to, input);
    if (targetFile !== null) {
      importTargets.set(targetFile, (importTargets.get(targetFile) ?? 0) + 1);
    }
  }

  // Symbols in high-import files, sorted by how many files import from their
  // file.
  const candidates = input.symbols
    .filter((s) => EXPORT_KINDS.has(s.kind))
    .map((s) => ({
      symbol: s,
      importCount: importTargets.get(s.filePath) ?? 0,
    }))
    .sort((a, b) => b.importCount - a.importCount)
    .slice(0, 8)
    .map((c) => c.symbol);

  return candidates;
}

/** Detect cycles in the dependency graph (simplified Tarjan-like detection). */
function findCycles(input: DigestInput): readonly string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of input.dependencies) {
    const fromList = adjacency.get(edge.from) ?? [];
    fromList.push(edge.to);
    adjacency.set(edge.from, fromList);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart));
      }
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    inStack.add(node);
    path.push(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      dfs(neighbor, path);
    }
    path.pop();
    inStack.delete(node);
  }

  for (const node of adjacency.keys()) {
    dfs(node, []);
  }

  // Deduplicate cycles and limit to 5.
  const unique = dedupeCycles(cycles);
  return unique.slice(0, 5);
}

/** Deduplicate cycles by normalizing their starting point. */
function dedupeCycles(cycles: readonly string[][]): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const cycle of cycles) {
    // Normalize: start from the lexicographically smallest node.
    let minIdx = 0;
    for (let i = 1; i < cycle.length; i++) {
      if (cycle[i] < cycle[minIdx]) {
        minIdx = i;
      }
    }
    const normalized = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)].join("→");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(cycle);
    }
  }
  return result;
}

/** Count files per language. */
function countByLanguage(files: readonly DigestFile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    counts[file.language] = (counts[file.language] ?? 0) + 1;
  }
  return counts;
}

/** Shorten a file path for display (keep last 2 segments). */
function shortPath(path: string): string {
  const segments = path.replace(/\\/g, "/").split("/");
  if (segments.length <= 2) {
    return path;
  }
  return `${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
}

/** Basename of a path (last segment). */
function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}
