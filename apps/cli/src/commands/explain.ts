import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type {
  ContextSDK,
  DependencyContext,
  FileContext,
  Summary,
  SymbolContext,
  SymbolReference,
} from "@atlas/sdk";
import { createContextSDK } from "@atlas/sdk";
import type { Command } from "commander";
import { openMetrics } from "./metrics";
import { contextDbPath, resolveProjectRoot } from "./search";
import { openUsage } from "./usage";

/** Parsed `atlas explain` CLI options. */
export interface ExplainCliOptions {
  readonly repo?: string;
  readonly json?: boolean;
  readonly ai?: boolean;
}

/** What `atlas explain` resolved the target to. */
export type ExplainKind = "file" | "module" | "symbol" | "concept";

/** Serializable output of a deterministic explanation. */
export interface ExplainData {
  readonly target: string;
  readonly kind: ExplainKind;
  /** Resolved absolute file path (file/module/symbol kinds). */
  readonly path?: string;
  readonly language?: string;
  /** The file's indexed content (file kind) or the symbol's declaration. */
  readonly content?: string;
  readonly symbol?: SymbolContext;
  readonly references: readonly SymbolReference[];
  readonly dependencies: readonly DependencyContext[];
  readonly dependents: readonly DependencyContext[];
  readonly relatedFiles: readonly FileContext[];
  /** Stored summary for the resolved target, when one exists. */
  readonly storedSummary?: Summary;
  /** Freshly generated summary (only when `--ai` succeeds). */
  readonly generatedSummary?: Summary;
  /** Message when `--ai` was requested but could not run. */
  readonly aiMessage?: string;
}

export function registerExplain(program: Command): void {
  program
    .command("explain")
    .description("Explain a symbol, file, module, or concept from the CodeAtlas index")
    .argument("<target>", "symbol, file path, module path, or concept to explain")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--json", "print the explanation as JSON")
    .option(
      "--ai",
      "generate a fresh AI summary (requires a configured provider; deterministic data is always included)",
    )
    .action(async (target: string, options: ExplainCliOptions) => {
      await runExplain(target, options);
    });
}

async function runExplain(target: string, options: ExplainCliOptions): Promise<void> {
  const root = options.repo === undefined ? resolveProjectRoot() : resolve(options.repo);
  const dbPath = contextDbPath(root);
  if (!existsSync(dbPath)) {
    console.error(`No context index found at ${dbPath}.`);
    console.error(
      "Build the index first (e.g. via `atlas build` or the SDK `ContextStore.saveContext`).",
    );
    process.exitCode = 1;
    return;
  }

  const metrics = openMetrics(root);
  const usage = openUsage(root);
  const context = createContextSDK({ repositoryPath: root, dbPath, metrics, usage });
  try {
    const data = resolveExplain(context, root, target);
    const output = options.ai === true ? await applyAi(context, data) : data;
    if (options.json === true) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(renderExplanation(output));
    }
  } finally {
    context.close();
    metrics.flush();
    metrics.close();
    usage.close();
  }
}

/** Candidate file paths to try for a target (absolute + joined + normalized). */
function candidates(root: string, target: string): string[] {
  const normalized = target.replace(/\\/g, "/");
  const base = isAbsolute(normalized)
    ? [normalized]
    : [normalized, join(root, normalized).replace(/\\/g, "/")];
  return [...new Set(base)];
}

/** Resolve a target deterministically: file, module, symbol, then concept. */
export function resolveExplain(context: ContextSDK, root: string, target: string): ExplainData {
  for (const path of candidates(root, target)) {
    const file = tryGetFile(context, path);
    if (file !== undefined) {
      const storedSummary = context.summaries.getFileSummary(path);
      const dependencies = context.dependencies.getDependencies(path);
      const dependents = context.dependencies.getDependents(path);
      return {
        target,
        kind: "file",
        path,
        language: file.language,
        content: file.content,
        references: [],
        dependencies,
        dependents,
        relatedFiles: [],
        ...(storedSummary === undefined ? {} : { storedSummary }),
      };
    }
  }

  for (const path of candidates(root, target)) {
    if (context.modules.getModule(path) !== undefined) {
      return explainModule(context, target, path);
    }
  }

  const symbolHits = context.symbols.searchSymbols(target, { limit: 5 });
  if (symbolHits.length > 0) {
    const hit = symbolHits[0];
    const symbolId = hit.targetId?.startsWith("symbol:")
      ? hit.targetId.slice("symbol:".length)
      : hit.targetId;
    if (symbolId !== null && symbolId !== undefined) {
      return explainSymbol(context, target, symbolId);
    }
  }

  const relevant = context.getRelevantContext(target);
  return {
    target,
    kind: "concept",
    references: [],
    dependencies: relevant.dependencies,
    dependents: [],
    relatedFiles: relevant.files,
    ...(relevant.summaries[0] === undefined ? {} : { storedSummary: relevant.summaries[0] }),
  };
}

function tryGetFile(
  context: ContextSDK,
  path: string,
): { readonly language: string; readonly content: string } | undefined {
  try {
    const file = context.files.getFile(path);
    return { language: file.language, content: file.content };
  } catch {
    return undefined;
  }
}

function explainModule(context: ContextSDK, target: string, path: string): ExplainData {
  const explanation = context.modules.explain(path);
  const storedSummary = explanation.summary ?? undefined;
  return {
    target,
    kind: "module",
    path,
    references: [],
    dependencies: explanation.dependencies,
    dependents: [],
    relatedFiles: explanation.files,
    ...(storedSummary === undefined ? {} : { storedSummary }),
  };
}

function explainSymbol(context: ContextSDK, target: string, symbolId: string): ExplainData {
  const symbol = context.symbols.getSymbol(symbolId);
  const references = context.symbols.findReferences(symbolId);
  const dependencies = context.dependencies.getDependencies(symbolId);
  const dependents = context.dependencies.getDependents(symbolId);
  const declaration = tryGetFile(context, symbol.filePath);
  const storedSummary = context.summaries.getFileSummary(symbol.filePath);
  return {
    target,
    kind: "symbol",
    path: symbol.filePath,
    symbol,
    ...(declaration === undefined ? {} : { content: declaration.content }),
    references,
    dependencies,
    dependents,
    relatedFiles: [],
    ...(storedSummary === undefined ? {} : { storedSummary }),
  };
}

/** Run `--ai`: generate a fresh summary for the resolved target. */
async function applyAi(context: ContextSDK, data: ExplainData): Promise<ExplainData> {
  const path = data.path;
  if (data.kind === "concept" || path === undefined) {
    return { ...data, aiMessage: "AI summary is not available for concept targets." };
  }
  if (data.kind === "module") {
    const result = await context.summaries.generateModule(path);
    if (result.ok) {
      return { ...data, generatedSummary: result.value };
    }
    return { ...data, aiMessage: result.error.message };
  }
  const result = await context.summaries.generateFile(path);
  if (result.ok) {
    return { ...data, generatedSummary: result.value };
  }
  return { ...data, aiMessage: result.error.message };
}

function formatSummary(summary: Summary | undefined, label: string): string {
  if (summary === undefined) {
    return "";
  }
  const lines = [
    `${label} (${summary.kind}, ${summary.metadata.provider}/${summary.metadata.model}):`,
  ];
  lines.push(`  ${summary.content.overview}`);
  for (const point of summary.content.keyPoints) {
    lines.push(`  • ${point}`);
  }
  return lines.join("\n");
}

/** Render a human-readable explanation. */
export function renderExplanation(data: ExplainData): string {
  const lines = [`Explanation for "${data.target}" (${data.kind})`];

  if (data.path !== undefined) {
    lines.push(`  Path: ${data.path}${data.language === undefined ? "" : ` (${data.language})`}`);
  }
  if (data.symbol !== undefined) {
    lines.push(`  Symbol: ${data.symbol.name} (${data.symbol.kind})`);
    if (data.symbol.documentation !== null && data.symbol.documentation !== undefined) {
      lines.push(`  Docs: ${data.symbol.documentation}`);
    }
  }

  const stored = formatSummary(data.storedSummary, "Stored summary");
  if (stored !== "") {
    lines.push("", stored);
  }
  const generated = formatSummary(data.generatedSummary, "Generated summary");
  if (generated !== "") {
    lines.push("", generated);
  }

  if (data.references.length > 0) {
    const names = data.references
      .slice(0, 20)
      .map((reference) => `${reference.symbol.name} (${reference.kind})`)
      .join(", ");
    lines.push("", `Referenced by (${data.references.length}): ${names}`);
  }

  if (data.dependencies.length > 0) {
    const edges = data.dependencies
      .slice(0, 20)
      .map((edge) => `${edge.fromLabel} → ${edge.toLabel} (${edge.kind})`)
      .join(", ");
    lines.push("", `Depends on (${data.dependencies.length}): ${edges}`);
  }

  if (data.dependents.length > 0) {
    const edges = data.dependents
      .slice(0, 20)
      .map((edge) => `${edge.fromLabel} → ${edge.toLabel} (${edge.kind})`)
      .join(", ");
    lines.push("", `Depended on by (${data.dependents.length}): ${edges}`);
  }

  if (data.relatedFiles.length > 0) {
    const files = data.relatedFiles
      .slice(0, 20)
      .map((file) => file.path)
      .join(", ");
    lines.push("", `Related files (${data.relatedFiles.length}): ${files}`);
  }

  if (data.content !== undefined && data.content !== "") {
    const preview =
      data.content.length > 400 ? `${data.content.slice(0, 400).trimEnd()}…` : data.content;
    lines.push("", "Declaration preview:", "```", preview, "```");
  }

  if (data.aiMessage !== undefined) {
    lines.push("", `AI: ${data.aiMessage}`);
  }

  return lines.join("\n");
}
