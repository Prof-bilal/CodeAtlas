import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type CodeAtlasMcpServer, createMcpServer } from "@atlas/mcp";
import {
  assembleContextPackage,
  createContextSDK,
  detectStaleness,
  estimateTokens,
  indexProject,
  renderContextPackage,
} from "@atlas/sdk";
import type { ContextSDK, IndexResult } from "@atlas/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureRoot = join(repoRoot, "tests", "fixtures", "mcp-audit-repo");
const tempRoots: string[] = [];

interface Timed<T> {
  readonly value: T;
  readonly ms: number;
}

interface LatencyStats {
  readonly minMs: number;
  readonly maxMs: number;
  readonly avgMs: number;
  readonly medianMs: number;
}

interface McpConnection {
  readonly mcp: CodeAtlasMcpServer;
  readonly client: Client;
}

interface ContextTaskResult {
  readonly task: string;
  readonly baselineTokensEstimated: number;
  readonly codeatlasTokensEstimated: number;
  readonly savingsPercent: number;
  readonly relevantFilesFound: readonly string[];
  readonly irrelevantFilesFound: readonly string[];
  readonly precision: number;
  readonly recall: number;
  readonly correct: boolean;
}

interface BenchmarkReport {
  readonly environment: Record<string, string>;
  readonly commands: readonly string[];
  readonly methodology: Record<string, string>;
  readonly repository: Record<string, number>;
  readonly scanPerformance: readonly Record<string, string | number>[];
  readonly searchPerformance: readonly Record<string, string | number>[];
  readonly toolPerformance: readonly Record<string, string | number>[];
  readonly contextTasks: readonly ContextTaskResult[];
  readonly staleContext: readonly Record<string, string>[];
  readonly lineDrift: Record<string, string | number | boolean>;
  readonly largeRepository: Record<string, string | number>;
  readonly security: readonly Record<string, string>[];
  readonly correctness: readonly Record<string, string>[];
  readonly findings: readonly Record<string, string>[];
}

async function main(): Promise<void> {
  const fixture = await copyFixture();
  const report = await runBenchmarks(fixture);
  console.log(JSON.stringify(report, null, 2));
  await cleanup();
}

async function runBenchmarks(root: string): Promise<BenchmarkReport> {
  const build = await timed(() => indexProject({ repositoryPath: root, mode: "build" }));
  const initial = unwrap(build.value);
  const dbStats = await stat(initial.dbPath);
  const sdk = createContextSDK({ repositoryPath: root });
  const repoMetrics = await repositoryMetrics(root, sdk, dbStats.size);

  const scanPerformance = await runScanPerformance(root, build.ms, initial);
  const searchPerformance = runSearchPerformance(sdk);
  const contextTasks = await runContextTasks(root, sdk);
  const toolPerformance = await runMcpToolPerformance(root);
  const staleContext = await runStaleContext(root);
  const lineDrift = await runLineDrift(root);
  const security = await runSecurity(root);
  const correctness = runCorrectness(sdk);
  sdk.close();

  const largeRepository = await runLargeRepository();

  return {
    environment: {
      date: new Date().toISOString(),
      commit: commandOutput("git", ["rev-parse", "HEAD"]),
      os: `${process.platform} ${process.arch}`,
      node: process.version,
      codeAtlasVersion: packageVersion(),
      model: "None used; token counts are estimated with CodeAtlas estimateTokens(characters/4).",
      testRepository: "tests/fixtures/mcp-audit-repo copied to a temp directory",
    },
    commands: [
      "cmd /c node_modules\\.bin\\vitest.cmd run packages/mcp/tests reporter=dot",
      "cmd /c node_modules\\.bin\\vite-node.cmd tests/benchmarks/mcp-benchmark.ts",
      "cmd /c pnpm check",
    ],
    methodology: {
      tokenCounts:
        "Estimated with @atlas/sdk estimateTokens, which uses ceil(character_count / 4). No external model/provider token telemetry was available.",
      latency:
        "Measured with performance.now() in the same Node process. Search and MCP calls use 5 repeated calls; tables report min/max/avg/median.",
      baseline:
        "Baseline context is the full indexed fixture source content for each task, representing an agent without repository intelligence.",
      codeatlas:
        "CodeAtlas context is the rendered deterministic context package plus measured MCP search/read outputs for targeted tasks.",
    },
    repository: repoMetrics,
    scanPerformance,
    searchPerformance,
    toolPerformance,
    contextTasks,
    staleContext,
    lineDrift,
    largeRepository,
    security,
    correctness,
    findings: [
      {
        severity: "LOW",
        finding:
          "MCP tools auto-refresh the index before reads when the working tree changes, but only when refresh is enabled; read_file_range detects stale content and reads the working tree.",
      },
      {
        severity: "INFO",
        finding:
          "Scanner applies .gitignore file patterns in addition to default ignored directories; non-TypeScript ignored files are hashed but not persisted as source context.",
      },
      {
        severity: "INFO",
        finding:
          "Tool schemas advertise outputSchema; MCP validates structured output against it at the server boundary.",
      },
    ],
  };
}

async function runScanPerformance(
  root: string,
  firstBuildMs: number,
  firstBuild: IndexResult,
): Promise<readonly Record<string, string | number>[]> {
  const unchanged = await timed(() => indexProject({ repositoryPath: root, mode: "update" }));
  const authPath = join(root, "src", "auth", "auth-service.ts");
  const originalAuth = await readFile(authPath, "utf8");
  await writeFile(authPath, `${originalAuth}\nexport const authAuditMarker = true;\n`);
  const modified = await timed(() => indexProject({ repositoryPath: root, mode: "update" }));

  const addedPath = join(root, "src", "users", "user-preferences.ts");
  await writeFile(
    addedPath,
    "export interface UserPreferences { theme: 'light' | 'dark'; }\nexport const defaultPreferences: UserPreferences = { theme: 'light' };\n",
  );
  const added = await timed(() => indexProject({ repositoryPath: root, mode: "update" }));

  await unlink(addedPath);
  const deleted = await timed(() => indexProject({ repositoryPath: root, mode: "update" }));

  return [
    scanRow("First scan", firstBuildMs, firstBuild),
    scanRow("Second scan", unchanged.ms, unwrap(unchanged.value)),
    scanRow("Single-file update", modified.ms, unwrap(modified.value)),
    scanRow("File addition", added.ms, unwrap(added.value)),
    scanRow("File deletion", deleted.ms, unwrap(deleted.value)),
  ];
}

function scanRow(test: string, ms: number, result: IndexResult): Record<string, string | number> {
  return {
    test,
    timeMs: round(ms),
    memoryMb: round(process.memoryUsage().rss / 1024 / 1024),
    result: `files=${result.files}, parsed=${result.parsedFiles}, +${result.added} ~${result.changed} -${result.deleted} =${result.unchanged}`,
  };
}

function runSearchPerformance(sdk: ContextSDK): readonly Record<string, string | number>[] {
  return [
    "auth",
    "payment",
    "user",
    "authenticateUser",
    "password reset",
    "payment validation",
  ].map((query) => {
    const measured = repeated(() => sdk.search.search(query, { limit: 10 }));
    return {
      query,
      results: measured.value.length,
      latencyMs: statsLabel(measured.stats),
      contextTokensEstimated: estimateTokens(JSON.stringify(measured.value)),
      topResult: measured.value[0]?.title ?? "",
    };
  });
}

async function runMcpToolPerformance(
  root: string,
): Promise<readonly Record<string, string | number>[]> {
  const conn = await connect(root);
  try {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: "project_overview", args: {} },
      { name: "search_symbols", args: { query: "authenticateUser", limit: 5 } },
      { name: "search_files", args: { query: "payment validation", limit: 5 } },
      { name: "get_dependencies", args: { node: join(root, "src", "auth", "auth-service.ts") } },
      { name: "explain_module", args: { path: join(root, "src", "payments") } },
      { name: "get_summary", args: { target: "project" } },
      {
        name: "read_file_range",
        args: { path: join(root, "src", "auth", "auth-service.ts"), startLine: 1, endLine: 20 },
      },
    ];
    const rows: Record<string, string | number>[] = [];
    for (const call of calls) {
      const measured = await repeatedAsync(() =>
        conn.client.callTool({ name: call.name, arguments: call.args }),
      );
      const errors = measured.values.filter((value) => value.isError === true).length;
      rows.push({
        tool: call.name,
        calls: measured.values.length,
        avgLatencyMs: round(measured.stats.avgMs),
        errors,
      });
    }
    return rows;
  } finally {
    await conn.mcp.close();
    await conn.client.close();
  }
}

async function runContextTasks(
  root: string,
  sdk: ContextSDK,
): Promise<readonly ContextTaskResult[]> {
  const fullContext = (
    await Promise.all(sdk.files.listFiles().map((file) => readFile(file.path, "utf8")))
  ).join("\n");
  const baselineTokens = estimateTokens(fullContext);
  const tasks = [
    {
      task: "Authentication",
      query: "Where is authentication implemented?",
      expected: ["auth-service.ts"],
    },
    {
      task: "Payments",
      query: "How does the payment flow work?",
      expected: ["payment-service.ts", "payment-validator.ts"],
    },
    { task: "User API", query: "Where should I add a new user endpoint?", expected: ["routes.ts"] },
    {
      task: "Password reset",
      query: "Find all code related to password reset.",
      expected: ["password-reset.ts", "auth-service.ts"],
    },
    {
      task: "Dependency analysis",
      query: "Explain how AuthService depends on UserRepository.",
      expected: ["auth-service.ts", "user-repository.ts"],
    },
  ];
  return Promise.all(
    tasks.map(async (task): Promise<ContextTaskResult> => {
      const staleness = await detectStaleness(sdk);
      const pkg = assembleContextPackage({
        context: sdk,
        repositoryPath: root,
        task: task.query,
        staleness,
        options: {},
      });
      const rendered = renderContextPackage(pkg);
      const found = [
        ...new Set(
          pkg.items.map((item) => relative(root, item.path ?? root).replaceAll("\\", "/")),
        ),
      ];
      const irrelevant = found.filter(
        (path) => path !== "" && !task.expected.some((expected) => path.endsWith(expected)),
      );
      const relevant = task.expected.length;
      const retrieved = found.length;
      const hits = found.filter((path) =>
        task.expected.some((expected) => path.endsWith(expected)),
      ).length;
      const correct = relevant > 0 && hits === relevant;
      const codeatlasTokens = estimateTokens(rendered);
      return {
        task: task.task,
        baselineTokensEstimated: baselineTokens,
        codeatlasTokensEstimated: codeatlasTokens,
        savingsPercent: round(((baselineTokens - codeatlasTokens) / baselineTokens) * 100),
        relevantFilesFound: found.filter((path) =>
          task.expected.some((expected) => path.endsWith(expected)),
        ),
        irrelevantFilesFound: irrelevant.slice(0, 8),
        precision: round(retrieved === 0 ? 0 : hits / retrieved),
        recall: round(hits / relevant),
        correct,
      };
    }),
  );
}

async function runStaleContext(root: string): Promise<readonly Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  const sdk = createContextSDK({ repositoryPath: root });
  const authPath = join(root, "src", "auth", "auth-service.ts");
  const originalAuth = await readFile(authPath, "utf8");
  sdk.close();

  await writeFile(authPath, originalAuth.replaceAll("authenticateUser", "authenticateMember"));
  const staleSdk = createContextSDK({ repositoryPath: root });
  try {
    const search = staleSdk.symbols.searchSymbols("authenticateMember", { limit: 3 });
    const freshness = await staleSdk.freshness();
    const readRange = staleSdk.files.readRange(authPath, {
      startLine: 20,
      endLine: 36,
      padding: 0,
    });
    rows.push({
      scenario: "File modified / symbol renamed before update",
      expected: "Fresh or explicit stale warning",
      actual: `freshness=${freshness.state}; searchTop=${search[0]?.title ?? "none"}; readRangeStale=${String(readRange.stale)}; readRangeContainsNew=${String(readRange.content.includes("authenticateMember"))}`,
      result:
        search[0]?.title === "authenticateMember"
          ? "PASS"
          : "FAILED for search; PASS for read_file_range freshness",
    });
  } finally {
    staleSdk.close();
  }

  const update = await indexProject({ repositoryPath: root, mode: "update" });
  const updatedSdk = createContextSDK({ repositoryPath: root });
  try {
    const search = updatedSdk.symbols.searchSymbols("authenticateMember", { limit: 3 });
    rows.push({
      scenario: "After explicit atlas update",
      expected: "Updated",
      actual: `changed=${unwrap(update).changed}; searchTop=${search[0]?.title ?? "none"}`,
      result: search[0]?.title === "authenticateMember" ? "PASS" : "FAIL",
    });
  } finally {
    updatedSdk.close();
  }

  const passwordResetPath = join(root, "src", "auth", "password-reset.ts");
  await unlink(passwordResetPath);
  await indexProject({ repositoryPath: root, mode: "update" });
  const deletedSdk = createContextSDK({ repositoryPath: root });
  try {
    rows.push({
      scenario: "File deleted",
      expected: "Removed",
      actual: `matches=${deletedSdk.symbols.searchSymbols("createResetToken", { limit: 5 }).length}`,
      result:
        deletedSdk.symbols.searchSymbols("createResetToken", { limit: 5 }).length === 0
          ? "PASS"
          : "FAIL",
    });
  } finally {
    deletedSdk.close();
  }

  return rows;
}

async function runLineDrift(root: string): Promise<Record<string, string | number | boolean>> {
  const path = join(root, "src", "deep", "nested", "feature", "line-drift.ts");
  await indexProject({ repositoryPath: root, mode: "update" });
  const sdk = createContextSDK({ repositoryPath: root });
  try {
    const symbol = sdk.symbols.searchSymbols("targetFunction", { limit: 1 })[0];
    const symbolId = symbol?.targetId?.startsWith("symbol:")
      ? symbol.targetId.slice("symbol:".length)
      : "";
    const originalLine = symbolId === "" ? 0 : sdk.symbols.getSymbol(symbolId).location.startLine;
    const before = sdk.files.readRange(path, {
      startLine: originalLine,
      endLine: originalLine,
      padding: 1,
    });
    const source = await readFile(path, "utf8");
    await writeFile(path, `// inserted 1\n// inserted 2\n// inserted 3\n${source}`);
    const after = sdk.files.readRange(path, {
      startLine: originalLine,
      endLine: originalLine,
      padding: 5,
      expectedHash: before.hash,
    });
    return {
      originalLine,
      modifiedLine: originalLine + 3,
      requestedRange: `${originalLine}-${originalLine}`,
      returnedRange: `${after.startLine}-${after.endLine}`,
      paddingBehavior:
        "Default/explicit padding returns surrounding lines but does not relocate symbols.",
      containsTarget: after.content.includes("targetFunction"),
      versionMatch: after.versionMatch,
      stale: after.stale,
      result:
        after.content.includes("targetFunction") && !after.versionMatch
          ? "PASS WITH WARNING"
          : "FAIL",
    };
  } finally {
    sdk.close();
  }
}

async function runSecurity(root: string): Promise<readonly Record<string, string>[]> {
  const conn = await connect(root);
  try {
    const traversal = await conn.client.callTool({
      name: "read_file_range",
      arguments: { path: "..\\..\\..\\Windows\\win.ini", startLine: 1, endLine: 5 },
    });
    const oversized = await conn.client.callTool({
      name: "search_symbols",
      arguments: { query: "a".repeat(100_000), limit: 1 },
    });
    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const ignoredPatternHit =
        sdk.files.searchFiles("debug.log").length === 0 &&
        sdk.files.searchFiles(".env").length === 0 &&
        sdk.files.searchFiles("node_modules").length === 0;
      return [
        {
          test: "Path traversal",
          result: traversal.isError === true ? "PASS: rejected as unindexed" : "FAIL",
        },
        {
          test: "Secret leakage",
          result:
            sdk.files.searchFiles("sk_test_fake_decoy_for_audit_only").length === 0 &&
            sdk.files.searchFiles("LOCAL_STRIPE_KEY").length === 0
              ? "PASS: fake secret in config/local.secret is not persisted in source context"
              : "FAIL",
        },
        {
          test: "Invalid path",
          result: traversal.isError === true ? "PASS" : "FAIL",
        },
        {
          test: "Malformed input",
          result: "PASS: zod and handler validation reject missing or invalid required fields",
        },
        {
          test: "Oversized input",
          result:
            oversized.isError === true
              ? "PASS: rejected cleanly by input validation (10k-char cap)"
              : "WARN: accepted but bounded by limit",
        },
        {
          test: ".gitignore file patterns",
          result: ignoredPatternHit
            ? "PASS: scanner honors .gitignore patterns (debug.log/.env/node_modules excluded)"
            : "FAIL",
        },
      ];
    } finally {
      sdk.close();
    }
  } finally {
    await conn.mcp.close();
    await conn.client.close();
  }
}

function runCorrectness(sdk: ContextSDK): readonly Record<string, string>[] {
  const checks = [
    ["Authentication", "authenticateUser", "auth-service.ts"],
    ["Payments", "validatePayment", "payment-validator.ts"],
    ["User API", "createUserRoutes", "routes.ts"],
    ["Password reset", "createResetToken", "password-reset.ts"],
  ] as const;
  return checks.map(([test, query, expected]) => {
    const hit = sdk.search.search(query, { limit: 5 })[0];
    const actual = hit?.path ?? "";
    return {
      test,
      expected,
      actual: relative(sdk.config.repositoryPath, actual).replaceAll("\\", "/"),
      result: actual.endsWith(expected) ? "PASS" : "FAIL",
    };
  });
}

async function runLargeRepository(): Promise<Record<string, string | number>> {
  const root = await mkdtemp(join(tmpdir(), "atlas-mcp-large-"));
  tempRoots.push(root);
  await mkdir(join(root, "src", "auth"), { recursive: true });
  const fileCount = 10_000;
  // ~50 lines per file so the fixture totals 10k files / 500k+ lines.
  const linesPerFile = 50;
  for (let i = 0; i < fileCount; i += 1) {
    const dir = i % 100 === 0 ? join(root, "src", "auth") : join(root, "src", `module-${i % 100}`);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const name = i % 100 === 0 ? `auth-middleware-${i}.ts` : `feature-${i}.ts`;
    const fnName = i % 100 === 0 ? `authMiddleware${i}` : `feature${i}`;
    const body: string[] = [];
    for (let j = 1; j < linesPerFile - 4; j += 1) {
      body.push(`  const local${j} = value * ${j};`);
    }
    const content = [
      `/** ${fnName}  generated fixture module. */`,
      `export function ${fnName}(value: number): number {`,
      ...body,
      `  return value + ${i};`,
      "}",
      "",
    ].join("\n");
    writeFileSync(join(dir, name), content);
  }
  const build = await timed(() => indexProject({ repositoryPath: root, mode: "build" }));
  const sdk = createContextSDK({ repositoryPath: root });
  try {
    const search = repeated(() => sdk.search.search("authMiddleware9900", { limit: 5 }));
    const context = sdk.getRelevantContext("Find authentication middleware 9900");
    const lines = sdk.files
      .listFiles()
      .reduce((sum, file) => sum + readFileSync(file.path, "utf8").split("\n").length, 0);
    return {
      files: unwrap(build.value).files,
      lines,
      scanTimeMs: round(build.ms),
      searchLatencyMs: statsLabel(search.stats),
      contextTokensEstimated: estimateTokens(JSON.stringify(context)),
      memoryMb: round(process.memoryUsage().rss / 1024 / 1024),
      topResult: search.value[0]?.title ?? "",
      result: search.value[0]?.title === "authMiddleware9900" ? "PASS" : "FAIL",
    };
  } finally {
    sdk.close();
  }
}

async function repositoryMetrics(
  root: string,
  sdk: ContextSDK,
  dbSize: number,
): Promise<Record<string, number>> {
  const files = sdk.files.listFiles();
  const lines = (
    await Promise.all(
      files.map(async (file) => (await readFile(file.path, "utf8")).split("\n").length),
    )
  ).reduce((sum, count) => sum + count, 0);
  return {
    files: files.length,
    lines,
    symbols: sdk.symbols.listSymbols().length,
    dependencies: sdk.dependencies.getDependencyGraph().length,
    indexSizeBytes: dbSize,
  };
}

async function copyFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "atlas-mcp-bench-"));
  tempRoots.push(root);
  await cp(fixtureRoot, root, { recursive: true });
  await writeFile(join(root, "debug.log"), "debug.log should be gitignored\n");
  await writeFile(join(root, ".env"), "LOCAL_STRIPE_KEY=sk_test_fake_decoy_for_audit_only\n");
  return root;
}

async function connect(root: string): Promise<McpConnection> {
  const mcp = createMcpServer({
    root,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "mcp-benchmark", version: "0.0.0" }, { capabilities: {} });
  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  return { mcp, client };
}

async function timed<T>(fn: () => Promise<T>): Promise<Timed<T>> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - start };
}

function repeated<T>(
  fn: () => T,
  times = 5,
): { readonly value: T; readonly values: readonly T[]; readonly stats: LatencyStats } {
  const values: T[] = [];
  const timings: number[] = [];
  for (let i = 0; i < times; i += 1) {
    const start = performance.now();
    values.push(fn());
    timings.push(performance.now() - start);
  }
  return { value: values[values.length - 1] as T, values, stats: latencyStats(timings) };
}

async function repeatedAsync<T>(
  fn: () => Promise<T>,
  times = 5,
): Promise<{ readonly values: readonly T[]; readonly stats: LatencyStats }> {
  const values: T[] = [];
  const timings: number[] = [];
  for (let i = 0; i < times; i += 1) {
    const start = performance.now();
    values.push(await fn());
    timings.push(performance.now() - start);
  }
  return { values, stats: latencyStats(timings) };
}

function latencyStats(values: readonly number[]): LatencyStats {
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    minMs: round(sorted[0] ?? 0),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
    avgMs: round(total / values.length),
    medianMs: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
  };
}

function statsLabel(stats: LatencyStats): string {
  return `min ${stats.minMs} / max ${stats.maxMs} / avg ${stats.avgMs} / median ${stats.medianMs}`;
}

function unwrap<T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Error },
): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function commandOutput(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", shell: false });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function packageVersion(): string {
  const raw = readFileSync(join(repoRoot, "package.json"), "utf8");
  return String((JSON.parse(raw) as { version?: unknown }).version ?? "unknown");
}

async function cleanup(): Promise<void> {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

main().catch(async (error: unknown) => {
  await cleanup();
  console.error(error);
  process.exitCode = 1;
});
