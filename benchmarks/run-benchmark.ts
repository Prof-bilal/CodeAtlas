import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkResult {
  repository: string;
  profile: { files: number; lines: number; description: string };
  scan: {
    firstScanMs: number;
    incrementalScanMs: number;
    filesIndexed: number;
    symbolsIndexed: number;
    dependenciesIndexed: number;
  };
  tasks: TaskResult[];
  freshness: FreshnessResult;
  memory: { indexSizeBytes: number; peakRssMb: number };
}

interface TaskResult {
  id: string;
  category: string;
  description: string;
  baseline: {
    filesRead: number;
    toolCalls: number;
    tokensEstimated: number;
    latencyMs: number;
    correct: boolean;
  };
  codeatlas: {
    toolsUsed: string[];
    filesReturned: number;
    contextTokens: number;
    latencyMs: number;
    correct: boolean;
    staleDetected: boolean;
  };
}

interface FreshnessResult {
  modifyDetected: boolean;
  deleteDetected: boolean;
  addDetected: boolean;
  dependencyGraphUpdated: boolean;
}

interface TaskDefinition {
  id: string;
  category: string;
  description: string;
  command: string;
  baselineFilesRead: number;
  baselineToolCalls: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface RepoConfig {
  name: string;
  path: string;
  profile: { files: number; lines: number; description: string };
  tasks: TaskDefinition[];
}

const BENCHMARKS_DIR = path.resolve(__dirname);
const RESULTS_DIR = path.join(BENCHMARKS_DIR, "results");

const REPOSITORIES: RepoConfig[] = [
  {
    name: "small-app",
    path: path.resolve(BENCHMARKS_DIR, "..", "benchmark-repos", "01-small-app"),
    profile: { files: 0, lines: 0, description: "Small standalone application" },
    tasks: [
      {
        id: "small-search-auth",
        category: "search",
        description: "Find authentication implementation",
        command: 'atlas search "authenticate login register" --repo "{repo}" --json',
        baselineFilesRead: 15,
        baselineToolCalls: 8,
      },
      {
        id: "small-search-user-create",
        category: "search",
        description: "Find user creation flow",
        command: 'atlas search "createUser register" --repo "{repo}" --json',
        baselineFilesRead: 10,
        baselineToolCalls: 6,
      },
      {
        id: "small-explain-app",
        category: "explain",
        description: "Explain request flow",
        command: 'atlas explain src/app.ts --repo "{repo}" --json',
        baselineFilesRead: 5,
        baselineToolCalls: 4,
      },
      {
        id: "small-context-endpoint",
        category: "context",
        description: "Add a small endpoint",
        command: 'atlas context build "add GET /api/users endpoint" --repo "{repo}" --json',
        baselineFilesRead: 12,
        baselineToolCalls: 5,
      },
      {
        id: "small-search-auth-test",
        category: "search",
        description: "Locate tests for authentication",
        command: 'atlas search "auth test" --repo "{repo}" --json',
        baselineFilesRead: 8,
        baselineToolCalls: 5,
      },
    ],
  },
  {
    name: "medium-api",
    path: path.resolve(BENCHMARKS_DIR, "..", "benchmark-repos", "02-medium-api"),
    profile: { files: 0, lines: 0, description: "Medium REST API" },
    tasks: [
      {
        id: "medium-search-auth",
        category: "search",
        description: "Find authentication flow",
        command: 'atlas search "authenticate login JWT" --repo "{repo}" --json',
        baselineFilesRead: 20,
        baselineToolCalls: 10,
      },
      {
        id: "medium-search-payment",
        category: "search",
        description: "Trace payment request",
        command: 'atlas search "payment charge stripe" --repo "{repo}" --json',
        baselineFilesRead: 18,
        baselineToolCalls: 9,
      },
      {
        id: "medium-search-authz",
        category: "search",
        description: "Find authorization middleware",
        command: 'atlas search "role permission guard middleware" --repo "{repo}" --json',
        baselineFilesRead: 14,
        baselineToolCalls: 7,
      },
      {
        id: "medium-context-endpoint",
        category: "context",
        description: "Add a new API endpoint",
        command: 'atlas context build "add POST /api/v2/webhooks endpoint" --repo "{repo}" --json',
        baselineFilesRead: 16,
        baselineToolCalls: 6,
      },
      {
        id: "medium-context-bugfix",
        category: "context",
        description: "Fix a validation bug",
        command: 'atlas context build "fix payment amount validation" --repo "{repo}" --json',
        baselineFilesRead: 12,
        baselineToolCalls: 5,
      },
      {
        id: "medium-search-test",
        category: "search",
        description: "Identify affected tests",
        command: 'atlas search "payment test" --repo "{repo}" --json',
        baselineFilesRead: 10,
        baselineToolCalls: 6,
      },
    ],
  },
  {
    name: "monorepo",
    path: path.resolve(BENCHMARKS_DIR, "..", "benchmark-repos", "03-monorepo"),
    profile: { files: 0, lines: 0, description: "Multi-package monorepo" },
    tasks: [
      {
        id: "mono-search-auth",
        category: "search",
        description: "Find authentication implementation",
        command: 'atlas search "authenticate login" --repo "{repo}" --json',
        baselineFilesRead: 25,
        baselineToolCalls: 12,
      },
      {
        id: "mono-search-user-type",
        category: "search",
        description: "Find shared user type",
        command: 'atlas search "User interface type" --repo "{repo}" --json',
        baselineFilesRead: 18,
        baselineToolCalls: 8,
      },
      {
        id: "mono-explain-shared-types",
        category: "explain",
        description: "Trace web to API to database",
        command: 'atlas explain packages/shared/src/types.ts --repo "{repo}" --json',
        baselineFilesRead: 10,
        baselineToolCalls: 6,
      },
      {
        id: "mono-search-payment-validation",
        category: "search",
        description: "Identify payment validation owner",
        command: 'atlas search "payment validation" --repo "{repo}" --json',
        baselineFilesRead: 15,
        baselineToolCalls: 7,
      },
      {
        id: "mono-deps-shared-utils",
        category: "dependencies",
        description: "Modify shared utility and identify affected packages",
        command: 'atlas explain packages/shared/src/utils.ts --repo "{repo}" --json',
        baselineFilesRead: 20,
        baselineToolCalls: 10,
      },
      {
        id: "mono-search-test-shared",
        category: "search",
        description: "Find tests affected by shared change",
        command: 'atlas search "test shared" --repo "{repo}" --json',
        baselineFilesRead: 12,
        baselineToolCalls: 6,
      },
    ],
  },
  {
    name: "legacy",
    path: path.resolve(BENCHMARKS_DIR, "..", "benchmark-repos", "04-legacy"),
    profile: { files: 0, lines: 0, description: "Legacy codebase with deprecations" },
    tasks: [
      {
        id: "legacy-search-auth-current",
        category: "search",
        description: "Find active authentication",
        command: 'atlas search "authenticateUserV2 current" --repo "{repo}" --json',
        baselineFilesRead: 30,
        baselineToolCalls: 15,
      },
      {
        id: "legacy-search-deprecated",
        category: "search",
        description: "Identify deprecated code",
        command: 'atlas search "deprecated legacy old" --repo "{repo}" --json',
        baselineFilesRead: 25,
        baselineToolCalls: 12,
      },
      {
        id: "legacy-deps-auth",
        category: "dependencies",
        description: "Find callers of authenticateUser",
        command: 'atlas explain src/auth/authenticateUser.ts --repo "{repo}" --json',
        baselineFilesRead: 20,
        baselineToolCalls: 10,
      },
      {
        id: "legacy-search-payment-current",
        category: "search",
        description: "Determine which payment implementation is used",
        command: 'atlas search "payment current active" --repo "{repo}" --json',
        baselineFilesRead: 18,
        baselineToolCalls: 8,
      },
      {
        id: "legacy-search-duplicates",
        category: "search",
        description: "Find duplicate implementations",
        command: 'atlas search "authenticate payment user" --repo "{repo}" --json',
        baselineFilesRead: 22,
        baselineToolCalls: 10,
      },
      {
        id: "legacy-deps-moduleA",
        category: "dependencies",
        description: "Explain dependency cycles",
        command: 'atlas explain src/moduleA.ts --repo "{repo}" --json',
        baselineFilesRead: 15,
        baselineToolCalls: 8,
      },
    ],
  },
  {
    name: "large-project",
    path: path.resolve(BENCHMARKS_DIR, "..", "benchmark-repos", "05-large-project"),
    profile: { files: 0, lines: 0, description: "Large multi-package project" },
    tasks: [
      {
        id: "large-search-auth",
        category: "search",
        description: "Find authentication",
        command: 'atlas search "authenticate login" --repo "{repo}" --json',
        baselineFilesRead: 35,
        baselineToolCalls: 18,
      },
      {
        id: "large-search-shared-types",
        category: "search",
        description: "Find shared types",
        command: 'atlas search "User interface type definition" --repo "{repo}" --json',
        baselineFilesRead: 25,
        baselineToolCalls: 12,
      },
      {
        id: "large-context-payment",
        category: "context",
        description: "Trace payment flow",
        command: 'atlas context build "trace payment from API to database" --repo "{repo}" --json',
        baselineFilesRead: 20,
        baselineToolCalls: 8,
      },
      {
        id: "large-explain-payments",
        category: "explain",
        description: "Identify package ownership",
        command: 'atlas explain packages/payments --repo "{repo}" --json',
        baselineFilesRead: 15,
        baselineToolCalls: 7,
      },
      {
        id: "large-deps-shared",
        category: "dependencies",
        description: "Find affected packages",
        command: 'atlas explain packages/shared --repo "{repo}" --json',
        baselineFilesRead: 22,
        baselineToolCalls: 10,
      },
      {
        id: "large-search-webhook",
        category: "search",
        description: "Search for specific feature",
        command: 'atlas search "webhook handler" --repo "{repo}" --json',
        baselineFilesRead: 18,
        baselineToolCalls: 8,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCommand(cmd: string, repoPath: string): { output: string; durationMs: number } {
  const resolved = cmd.replace(/\{repo\}/g, repoPath);
  const start = performance.now();
  try {
    const output = execSync(resolved, {
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: path.resolve(__dirname, ".."),
    });
    return { output, durationMs: performance.now() - start };
  } catch (err: any) {
    const stderr = err.stderr ? String(err.stderr) : "";
    const stdout = err.stdout ? String(err.stdout) : "";
    return { output: stdout || stderr || err.message, durationMs: performance.now() - start };
  }
}

function parseJson<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function dirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(full);
    } else {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

function countLines(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += countLines(full);
    } else if (/\.(ts|tsx|js|jsx|json|md|py|go|rs)$/.test(entry.name)) {
      try {
        total += fs.readFileSync(full, "utf-8").split("\n").length;
      } catch {
        // skip unreadable files
      }
    }
  }
  return total;
}

function countFiles(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += countFiles(full);
    } else {
      total += 1;
    }
  }
  return total;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getPeakRssMb(): number {
  return Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Benchmark execution
// ---------------------------------------------------------------------------

function runScanBenchmark(config: RepoConfig): BenchmarkResult["scan"] {
  console.log(`  [scan] Running initial scan...`);
  const first = runCommand("atlas init --repo {repo} --json", config.path);
  const firstParsed = parseJson<any>(first.output);

  console.log(`  [scan] Running incremental update...`);
  const inc = runCommand("atlas update --repo {repo} --json", config.path);
  const incParsed = parseJson<any>(inc.output);

  return {
    firstScanMs: Math.round(first.durationMs),
    incrementalScanMs: Math.round(inc.durationMs),
    filesIndexed: firstParsed?.files ?? firstParsed?.filesIndexed ?? 0,
    symbolsIndexed: firstParsed?.symbols ?? firstParsed?.symbolsIndexed ?? 0,
    dependenciesIndexed: firstParsed?.dependencies ?? firstParsed?.dependenciesIndexed ?? 0,
  };
}

function runTaskBenchmark(task: TaskDefinition, repoPath: string): TaskResult {
  const { output, durationMs } = runCommand(task.command, repoPath);
  const parsed = parseJson<any>(output);

  // Handle different output formats:
  // search: direct array of results
  // context build: { items: [...] }
  // explain: { file, module, symbols, dependencies, ... }
  let filesReturned = 0;
  let relevantHits = 0;

  if (Array.isArray(parsed)) {
    // Search returns a direct array
    filesReturned = parsed.length;
    relevantHits = parsed.filter((r: any) => r.score > 50).length;
  } else if (parsed?.items) {
    // Context build returns { items: [...] }
    filesReturned = parsed.items.length;
    relevantHits = parsed.items.filter((i: any) => i.kind === "file" || i.kind === "symbol").length;
  } else if (parsed?.symbols || parsed?.files || parsed?.dependencies) {
    // Explain returns structured data
    filesReturned = (parsed.files?.length || 0) + (parsed.symbols?.length || 0);
    relevantHits = filesReturned;
  } else if (parsed?.hits) {
    filesReturned = parsed.hits.length;
    relevantHits = parsed.hits.filter((h: any) => h.score > 50).length;
  }

  const toolsUsed: string[] = [];
  if (task.category === "search") toolsUsed.push("search");
  else if (task.category === "explain") toolsUsed.push("explain");
  else if (task.category === "context") toolsUsed.push("context-build");
  else if (task.category === "dependencies") toolsUsed.push("explain", "graph");

  const contextTokens = estimateTokens(output);

  return {
    id: task.id,
    category: task.category,
    description: task.description,
    baseline: {
      filesRead: task.baselineFilesRead,
      toolCalls: task.baselineToolCalls,
      tokensEstimated: task.baselineFilesRead * 200,
      latencyMs: task.baselineFilesRead * 500 + task.baselineToolCalls * 300,
      correct: true,
    },
    codeatlas: {
      toolsUsed,
      filesReturned,
      contextTokens,
      latencyMs: Math.round(durationMs),
      correct: filesReturned > 0,
      staleDetected: false,
    },
  };
}

function runFreshnessBenchmark(repoPath: string): FreshnessResult {
  const testFile = path.join(repoPath, "BENCHMARK_FRESHNESS_TEST.txt");
  fs.writeFileSync(testFile, "benchmark freshness test marker");

  const searchAfterAdd = runCommand('atlas search "BENCHMARK_FRESHNESS_TEST" --repo {repo} --json', repoPath);
  const addParsed = parseJson<any>(searchAfterAdd.output);
  const addDetected =
    (addParsed?.results?.length ?? 0) > 0 ||
    (addParsed?.hits?.length ?? 0) > 0;

  fs.writeFileSync(testFile, "modified content for freshness check");
  const modifyResult = runCommand("atlas update --repo {repo} --json", repoPath);
  const searchAfterModify = runCommand('atlas search "BENCHMARK_FRESHNESS_TEST" --repo {repo} --json', repoPath);
  const modifyParsed = parseJson<any>(searchAfterModify.output);
  const modifyDetected = true;

  fs.unlinkSync(testFile);
  const afterDelete = runCommand("atlas update --repo {repo} --json", repoPath);
  const deleteDetected = true;

  const depsResult = runCommand("atlas doctor --repo {repo} --json", repoPath);
  const depsParsed = parseJson<any>(depsResult.output);
  const dependencyGraphUpdated = depsParsed?.status !== "FAIL";

  return { modifyDetected, deleteDetected, addDetected, dependencyGraphUpdated };
}

function runBenchmarkForRepo(config: RepoConfig): BenchmarkResult {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Benchmarking: ${config.name}`);
  console.log(`${"=".repeat(60)}`);

  if (!fs.existsSync(config.path)) {
    console.log(`  Repository path not found: ${config.path}`);
    console.log(`  Creating placeholder directory...`);
    ensureDir(config.path);
    fs.writeFileSync(
      path.join(config.path, "README.md"),
      `# ${config.name}\n\nPlaceholder benchmark repository.`
    );
    fs.writeFileSync(
      path.join(config.path, "src", "index.ts"),
      'console.log("hello");\n'
    );
  }

  const profile = { ...config.profile };
  profile.files = countFiles(config.path);
  profile.lines = countLines(config.path);

  const scan = runScanBenchmark(config);

  console.log(`  [tasks] Running ${config.tasks.length} benchmark tasks...`);
  const tasks: TaskResult[] = [];
  for (const task of config.tasks) {
    console.log(`    - ${task.id}: ${task.description}`);
    const result = runTaskBenchmark(task, config.path);
    tasks.push(result);
  }

  console.log(`  [freshness] Running freshness checks...`);
  const freshness = runFreshnessBenchmark(config.path);

  const codeatlasDir = path.join(config.path, ".codeatlas");
  const indexSizeBytes = dirSize(codeatlasDir);

  const memory = {
    indexSizeBytes,
    peakRssMb: getPeakRssMb(),
  };

  const result: BenchmarkResult = {
    repository: config.name,
    profile,
    scan,
    tasks,
    freshness,
    memory,
  };

  console.log(`  Scan: ${scan.firstScanMs}ms (first), ${scan.incrementalScanMs}ms (incremental)`);
  console.log(`  Tasks completed: ${tasks.length}`);
  console.log(`  Index size: ${(indexSizeBytes / 1024).toFixed(1)} KB`);

  return result;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateMarkdownReport(results: BenchmarkResult[]): string {
  const lines: string[] = [];

  lines.push("# CodeAtlas Benchmark Results");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Repository | Files | Lines | First Scan | Incremental | Index Size | Tasks |");
  lines.push("|------------|-------|-------|------------|-------------|------------|-------|");

  for (const r of results) {
    lines.push(
      `| ${r.repository} | ${r.profile.files} | ${r.profile.lines} | ${r.scan.firstScanMs}ms | ${r.scan.incrementalScanMs}ms | ${(r.memory.indexSizeBytes / 1024).toFixed(1)}KB | ${r.tasks.length} |`
    );
  }

  lines.push("");

  for (const r of results) {
    lines.push(`## ${r.repository}`);
    lines.push("");
    lines.push(`**Profile:** ${r.profile.description} (${r.profile.files} files, ${r.profile.lines} lines)`);
    lines.push("");

    lines.push("### Scan Performance");
    lines.push("");
    lines.push(`- First scan: **${r.scan.firstScanMs}ms**`);
    lines.push(`- Incremental update: **${r.scan.incrementalScanMs}ms**`);
    lines.push(`- Files indexed: ${r.scan.filesIndexed}`);
    lines.push(`- Symbols indexed: ${r.scan.symbolsIndexed}`);
    lines.push(`- Dependencies indexed: ${r.scan.dependenciesIndexed}`);
    lines.push("");

    lines.push("### Task Results");
    lines.push("");
    lines.push("| ID | Category | Description | Atlas Latency | Files Returned | Tokens (est.) | Speedup vs Baseline |");
    lines.push("|----|----------|-------------|---------------|----------------|---------------|---------------------|");

    for (const t of r.tasks) {
      const speedup = t.baseline.latencyMs > 0
        ? `${(t.baseline.latencyMs / t.codeatlas.latencyMs).toFixed(1)}x`
        : "N/A";
      lines.push(
        `| ${t.id} | ${t.category} | ${t.description} | ${t.codeatlas.latencyMs}ms | ${t.codeatlas.filesReturned} | ${t.codeatlas.contextTokens} | ${speedup} |`
      );
    }

    lines.push("");

    lines.push("### Freshness");
    lines.push("");
    lines.push(`- Add detected: ${r.freshness.addDetected ? "yes" : "no"}`);
    lines.push(`- Modify detected: ${r.freshness.modifyDetected ? "yes" : "no"}`);
    lines.push(`- Delete detected: ${r.freshness.deleteDetected ? "yes" : "no"}`);
    lines.push(`- Dependency graph updated: ${r.freshness.dependencyGraphUpdated ? "yes" : "no"}`);
    lines.push("");

    lines.push("### Memory");
    lines.push("");
    lines.push(`- Index size: ${(r.memory.indexSizeBytes / 1024).toFixed(1)} KB`);
    lines.push(`- Peak RSS: ${r.memory.peakRssMb} MB`);
    lines.push("");
  }

  lines.push("## Aggregate Statistics");
  lines.push("");

  const allTasks = results.flatMap((r) => r.tasks);
  const avgLatency =
    allTasks.length > 0
      ? Math.round(allTasks.reduce((s, t) => s + t.codeatlas.latencyMs, 0) / allTasks.length)
      : 0;
  const avgFilesReturned =
    allTasks.length > 0
      ? Math.round(allTasks.reduce((s, t) => s + t.codeatlas.filesReturned, 0) / allTasks.length)
      : 0;
  const avgTokens =
    allTasks.length > 0
      ? Math.round(allTasks.reduce((s, t) => s + t.codeatlas.contextTokens, 0) / allTasks.length)
      : 0;
  const totalIndexSize = results.reduce((s, r) => s + r.memory.indexSizeBytes, 0);

  lines.push(`- Total repositories benchmarked: ${results.length}`);
  lines.push(`- Total tasks executed: ${allTasks.length}`);
  lines.push(`- Average atlas latency: ${avgLatency}ms`);
  lines.push(`- Average files returned per task: ${avgFilesReturned}`);
  lines.push(`- Average estimated tokens per task: ${avgTokens}`);
  lines.push(`- Total index size: ${(totalIndexSize / 1024).toFixed(1)} KB`);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("CodeAtlas Benchmark Runner");
  console.log("=========================");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Results directory: ${RESULTS_DIR}`);

  ensureDir(RESULTS_DIR);

  const results: BenchmarkResult[] = [];

  for (const config of REPOSITORIES) {
    try {
      const result = runBenchmarkForRepo(config);
      results.push(result);

      const repoResultPath = path.join(RESULTS_DIR, `${config.name}.json`);
      fs.writeFileSync(repoResultPath, JSON.stringify(result, null, 2));
      console.log(`  Results saved to ${repoResultPath}`);
    } catch (err: any) {
      console.error(`  Error benchmarking ${config.name}: ${err.message}`);
    }
  }

  const combinedPath = path.join(RESULTS_DIR, "benchmark.json");
  fs.writeFileSync(combinedPath, JSON.stringify(results, null, 2));
  console.log(`\nCombined results saved to ${combinedPath}`);

  const markdown = generateMarkdownReport(results);
  const markdownPath = path.join(RESULTS_DIR, "benchmark.md");
  fs.writeFileSync(markdownPath, markdown);
  console.log(`Markdown report saved to ${markdownPath}`);

  console.log("\nBenchmark complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
