import type {
  CachePort,
  HashPort,
  ProviderPort,
  ProviderRequest,
  SourceFile,
  Summary,
  SummaryKind,
  SummaryMetadata,
  SummaryOptions,
  SummaryPort,
} from "@atlas/core";
import type { CacheKey, Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import { parseSummaryContent } from "./json";
import {
  FILE_PROMPT_TEMPLATE,
  SCOPE_PROMPT_TEMPLATE,
  SYSTEM_JSON_INSTRUCTION,
  render,
  truncateContent,
} from "./prompts";

/** The ports a {@link SummaryService} is composed from. */
export interface SummaryServiceOptions {
  readonly provider: ProviderPort;
  readonly cache: CachePort;
  readonly hash: HashPort;
}

/**
 * Generates structured summaries of files, folders, modules, and projects,
 * behind the `SummaryPort` contract.
 *
 * Every summary is cached keyed by the content hash of what it covers, so
 * unchanged files are never re-sent to a model. Folder/module/project summaries
 * reuse their per-file summaries and only regenerate when the aggregate content
 * changes.
 */
export class SummaryService implements SummaryPort {
  private readonly provider: ProviderPort;
  private readonly cache: CachePort;
  private readonly hash: HashPort;

  public constructor(options: SummaryServiceOptions) {
    this.provider = options.provider;
    this.cache = options.cache;
    this.hash = options.hash;
  }

  public async summarizeFile(
    file: SourceFile,
    options: SummaryOptions = {},
  ): Promise<Result<Summary>> {
    const hash = this.hash.hashContent(file.content);
    const key = `summary:file:${hash}` as CacheKey;

    if (!options.force) {
      const cached = await this.cache.get<Summary>(key);
      if (cached.ok && cached.value !== undefined) {
        return ok(this.markCached(cached.value));
      }
    }

    const prompt = render(options.prompt ?? FILE_PROMPT_TEMPLATE, {
      path: file.path,
      language: file.language,
      content: truncateContent(file.content),
    });
    const generated = await this.generate("file", file.path, prompt, options);
    if (!generated.ok) {
      return generated;
    }
    await this.cache.set(key, generated.value);
    return ok(generated.value);
  }

  public async summarizeFolder(
    target: string,
    files: readonly SourceFile[],
    options: SummaryOptions = {},
  ): Promise<Result<Summary>> {
    return this.summarizeScope("folder", target, files, options);
  }

  public async summarizeModule(
    target: string,
    files: readonly SourceFile[],
    options: SummaryOptions = {},
  ): Promise<Result<Summary>> {
    return this.summarizeScope("module", target, files, options);
  }

  public async summarizeProject(
    files: readonly SourceFile[],
    options: SummaryOptions = {},
  ): Promise<Result<Summary>> {
    return this.summarizeScope("project", "", files, options);
  }

  private async summarizeScope(
    kind: "folder" | "module" | "project",
    target: string,
    files: readonly SourceFile[],
    options: SummaryOptions,
  ): Promise<Result<Summary>> {
    // Per-file summaries: unchanged files hit the per-file cache, so only
    // changed files reach the model. A per-file failure drops that file from
    // the scope instead of aborting the whole summary; if every file fails we
    // surface the last error so the caller can report it.
    const lines: string[] = [];
    let firstError: Error | undefined;
    for (const file of files) {
      const summary = await this.summarizeFile(file, options);
      if (!summary.ok) {
        firstError ??= summary.error;
        continue;
      }
      lines.push(`- ${file.path}: ${summary.value.content.overview}`);
    }
    if (lines.length === 0) {
      return fail(firstError ?? new Error("no files to summarize"));
    }

    const fileHashes = files.map((file) => this.hash.hashContent(file.content)).sort();
    const aggregateHash = this.hash.hashContent([target, ...fileHashes].join("|"));
    const key = `summary:${kind}:${aggregateHash}` as CacheKey;
    if (!options.force) {
      const cached = await this.cache.get<Summary>(key);
      if (cached.ok && cached.value !== undefined) {
        return ok(this.markCached(cached.value));
      }
    }

    const prompt = render(options.prompt ?? SCOPE_PROMPT_TEMPLATE, {
      kind,
      target: target === "" ? "(project)" : target,
      files: lines.join("\n"),
    });
    const generated = await this.generate(kind, target, prompt, options);
    if (!generated.ok) {
      return generated;
    }
    await this.cache.set(key, generated.value);
    return ok(generated.value);
  }

  private async generate(
    kind: SummaryKind,
    target: string,
    prompt: string,
    options: SummaryOptions,
  ): Promise<Result<Summary>> {
    const started = Date.now();
    const request: ProviderRequest = {
      prompt,
      system: SYSTEM_JSON_INSTRUCTION,
      json: true,
      ...(options.model !== undefined ? { model: options.model } : {}),
    };
    const response = await this.provider.complete(request);
    if (!response.ok) {
      return fail(response.error);
    }
    const content = parseSummaryContent(response.value.content);
    if (!content.ok) {
      return content;
    }
    const usage = response.value.usage;
    const metadata: SummaryMetadata = {
      generatedAt: new Date().toISOString(),
      provider: response.value.provider,
      model: response.value.model,
      prompt: options.prompt ?? null,
      cacheHit: false,
      durationMs: Date.now() - started,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
    };
    return ok({ kind, target, content: content.value, metadata });
  }

  private markCached(summary: Summary): Summary {
    return { ...summary, metadata: { ...summary.metadata, cacheHit: true } };
  }
}
