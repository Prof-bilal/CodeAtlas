import { existsSync } from "node:fs";
import { join } from "node:path";
import { createContextToolSourceFromSDK } from "@atlas/mcp";
import {
  ToolUsingChatAgent,
  assembleContextPackage,
  createContextSDK,
  createProviderService,
  indexProject,
  scanProjectOverview,
} from "@atlas/sdk";
import type { ContextPackage } from "@atlas/sdk";
import type { JobContext } from "./jobs";

/**
 * Browser benchmark — the "Test in Browser" quick test.
 *
 * For one repository and one user query this measures, with real work:
 * scan stats (files/languages/size), indexing (when the index is missing),
 * deterministic retrieval latency (`ContextSDK.getRelevantContext`), the
 * assembled context package (per-item scores/tokens/reasons, budget record,
 * secret exclusions), and the token comparison between the raw repository
 * estimate and the assembled context. An AI answer is optional: it runs only
 * when an Ollama provider is configured, and its status is reported honestly.
 *
 * Nothing here executes repository code — scanning, parsing, and retrieval
 * only read files.
 */
export interface BrowserBenchmarkResult {
  readonly repository: {
    readonly name: string;
    readonly path: string;
    readonly url?: string | undefined;
    readonly files: number;
    readonly symbols: number | null;
    readonly languages: Readonly<Record<string, number>>;
    readonly sizeBytes: number;
    readonly indexed: boolean;
    readonly indexCreated: boolean;
    readonly indexDurationMs: number;
  };
  readonly retrieval: {
    readonly latencyMs: number;
    readonly files: readonly {
      readonly path: string;
      readonly language: string;
      readonly size: number;
    }[];
    readonly symbols: readonly {
      readonly name: string;
      readonly kind: string;
      readonly filePath: string;
    }[];
    readonly dependencies: readonly {
      readonly from: string;
      readonly to: string;
      readonly kind: string;
    }[];
    readonly dependencyCount: number;
    readonly moduleCount: number;
    readonly summaryCount: number;
  };
  readonly context: {
    readonly items: readonly {
      readonly id: string;
      readonly kind: string;
      readonly title: string;
      readonly path: string | null;
      readonly score: number;
      readonly tokens: number;
      readonly truncated: boolean;
      readonly reason: string;
    }[];
    readonly tokensEstimated: number;
    readonly budget: ContextPackage["budget"];
    readonly exclusions: ContextPackage["exclusions"];
  };
  readonly tokens: {
    readonly rawEstimated: number;
    readonly contextEstimated: number;
    readonly saved: number;
    readonly savedPct: number;
    readonly method: "estimated";
  };
  readonly ai: {
    readonly status: "skipped" | "completed" | "unavailable" | "failed";
    readonly text?: string | undefined;
    readonly model?: string | undefined;
    readonly provider?: string | undefined;
    readonly inputTokens?: number | undefined;
    readonly outputTokens?: number | undefined;
    readonly durationMs?: number | undefined;
    readonly error?: string | undefined;
  };
}

export interface BrowserBenchmarkInput {
  readonly repositoryPath: string;
  readonly repositoryName: string;
  readonly repositoryUrl?: string | undefined;
  readonly query: string;
  readonly ai: boolean;
  /** Wall-clock budget for the optional AI answer (default 180s). */
  readonly aiTimeoutMs?: number | undefined;
}

const AI_TIMEOUT_MS = 180_000;
const MAX_LISTED_ITEMS = 50;

export async function runBrowserBenchmark(
  ctx: JobContext,
  input: BrowserBenchmarkInput,
): Promise<BrowserBenchmarkResult> {
  const { repositoryPath, query } = input;
  if (query.trim().length === 0) throw new Error("Query must not be empty");

  // --- prepare: real scan stats (metadata only, no file execution) ---
  ctx.startStage("prepare");
  ctx.throwIfCancelled();
  if (!existsSync(repositoryPath)) {
    throw new Error(`Repository path does not exist: ${repositoryPath}`);
  }
  const scan = await scanProjectOverview(repositoryPath as never);
  if (!scan.ok) throw new Error(`Scanning failed: ${scan.error.message}`);
  const languages: Record<string, number> = {};
  for (const lang of scan.value.languages) languages[lang.name] = lang.fileCount;
  const sizeBytes = scan.value.files.reduce((s, f) => s + f.sizeBytes, 0);
  ctx.finishStage("prepare", "done", `${scan.value.totalFiles} files · ${scan.value.name}`);

  // --- index: build when missing, measure it, then read index stats ---
  ctx.startStage("index");
  ctx.throwIfCancelled();
  const dbPath = join(repositoryPath, ".codeatlas", "context.db");
  const indexExisted = existsSync(dbPath);
  let indexDurationMs = 0;
  if (!indexExisted) {
    const startedAt = performance.now();
    const result = await indexProject({ repositoryPath, mode: "build" });
    if (!result.ok) throw new Error(`Indexing failed: ${result.error.message}`);
    indexDurationMs = Math.round(performance.now() - startedAt);
    ctx.finishStage(
      "index",
      "done",
      `built index · ${result.value.files} files · ${indexDurationMs}ms`,
    );
  } else {
    ctx.finishStage("index", "skipped", "index already present");
  }

  const sdk = createContextSDK({ repositoryPath });
  try {
    let symbols: number | null = null;
    try {
      symbols = sdk.project.overview("summary").counts.symbols;
    } catch {
      symbols = null;
    }

    // --- retrieve: deterministic ranked retrieval, latency measured ---
    ctx.startStage("retrieve");
    ctx.throwIfCancelled();
    const retrieveStarted = performance.now();
    const relevant = sdk.getRelevantContext(query);
    const latencyMs = Math.round((performance.now() - retrieveStarted) * 100) / 100;
    ctx.finishStage("retrieve", "done", `${relevant.files.length} files · ${latencyMs}ms`);

    // --- package: budgeted, deny-filtered context assembly ---
    ctx.startStage("package");
    ctx.throwIfCancelled();
    const pkg = assembleContextPackage({
      context: sdk,
      repositoryPath,
      task: query,
      staleness: await sdk.freshness(),
      options: {},
    });
    ctx.finishStage(
      "package",
      "done",
      `${pkg.items.length} items · ~${pkg.budget.tokensEstimated} tokens`,
    );

    // --- optional AI answer (only when a provider is configured) ---
    let ai: BrowserBenchmarkResult["ai"] = { status: "skipped" };
    if (input.ai) {
      ctx.startStage("answer");
      ctx.throwIfCancelled();
      ai = await answerWithOllama(sdk, query, repositoryPath, input.aiTimeoutMs ?? AI_TIMEOUT_MS);
      ctx.finishStage("answer", ai.status === "completed" ? "done" : "skipped", ai.status);
    }

    const rawEstimated = Math.ceil(sizeBytes / 4);
    const contextEstimated = pkg.budget.tokensEstimated;
    const saved = Math.max(0, rawEstimated - contextEstimated);
    const savedPct = rawEstimated > 0 ? Math.round((saved / rawEstimated) * 1000) / 10 : 0;

    return {
      repository: {
        name: input.repositoryName,
        path: repositoryPath,
        url: input.repositoryUrl,
        files: scan.value.totalFiles,
        symbols,
        languages,
        sizeBytes,
        indexed: true,
        indexCreated: !indexExisted,
        indexDurationMs,
      },
      retrieval: {
        latencyMs,
        files: relevant.files.map((f) => ({ path: f.path, language: f.language, size: f.size })),
        symbols: relevant.symbols
          .slice(0, MAX_LISTED_ITEMS)
          .map((s) => ({ name: s.name, kind: s.kind, filePath: s.filePath })),
        dependencies: relevant.dependencies
          .slice(0, MAX_LISTED_ITEMS)
          .map((d) => ({ from: d.fromLabel, to: d.toLabel, kind: d.kind })),
        dependencyCount: relevant.dependencies.length,
        moduleCount: relevant.modules.length,
        summaryCount: relevant.summaries.length,
      },
      context: {
        items: pkg.items.slice(0, MAX_LISTED_ITEMS).map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          path: i.path,
          score: i.score,
          tokens: i.tokens,
          truncated: i.truncated,
          reason: i.reason,
        })),
        tokensEstimated: pkg.budget.tokensEstimated,
        budget: pkg.budget,
        exclusions: pkg.exclusions,
      },
      tokens: {
        rawEstimated,
        contextEstimated,
        saved,
        savedPct,
        method: "estimated",
      },
      ai,
    };
  } finally {
    sdk.close();
  }
}

/**
 * Run the optional AI answer through the same tool-loop composition the
 * benchmark's Ollama codeatlas mode uses (7 MCP context tools, bounded
 * rounds). Fails honestly — never fabricates an answer.
 */
async function answerWithOllama(
  sdk: ReturnType<typeof createContextSDK>,
  query: string,
  repositoryPath: string,
  timeoutMs: number,
): Promise<BrowserBenchmarkResult["ai"]> {
  const providers = createProviderService();
  if (!providers.listProviders().includes("ollama")) {
    return {
      status: "unavailable",
      error:
        "No AI provider configured. Connect Ollama (`atlas ollama connect`) to enable AI answers.",
    };
  }
  const toolSource = createContextToolSourceFromSDK(sdk);
  const agent = new ToolUsingChatAgent(providers, toolSource, ["ollama"]);
  const startedAt = performance.now();
  try {
    const result = await withTimeout(
      agent.run({ provider: "ollama", prompt: query, repositoryPath }),
      timeoutMs,
    );
    if (!result.ok) {
      return { status: "failed", error: result.error.message };
    }
    return {
      status: "completed",
      text: result.value.content,
      model: result.value.model,
      provider: "ollama",
      inputTokens: result.value.tokenUsage?.inputTokens,
      outputTokens: result.value.tokenUsage?.outputTokens,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      error: message.includes("timeout")
        ? `AI answer timed out after ${Math.round(timeoutMs / 1000)}s`
        : message,
    };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
