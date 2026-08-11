import type { Result } from "@atlas/shared";
import type { SourceFile } from "../domain/entities";

/** The scope of a generated summary. */
export type SummaryKind = "file" | "folder" | "module" | "project";

/** Per-call options for a summary request. */
export interface SummaryOptions {
  /**
   * Custom prompt template. Placeholders `{path}`, `{content}`, `{language}`
   * (file) and `{target}`, `{files}` (folder/module/project) are substituted.
   * When omitted, the built-in template for the summary kind is used.
   */
  readonly prompt?: string;
  /** Model id override for the provider. */
  readonly model?: string;
  /** Bypass the cache and regenerate, even for unchanged content. */
  readonly force?: boolean;
}

/** The structured fields a summary carries (parsed from the model's JSON). */
export interface SummaryContent {
  readonly overview: string;
  readonly keyPoints: readonly string[];
}

/** Generation bookkeeping attached to every summary. */
export interface SummaryMetadata {
  /** ISO timestamp when the summary was generated. */
  readonly generatedAt: string;
  /** Provider adapter used (e.g. `"claude"`). */
  readonly provider: string;
  /** Model id that produced the summary. */
  readonly model: string;
  /** The custom prompt used, or `null` for the built-in template. */
  readonly prompt: string | null;
  /** Whether the summary was served from cache (no model call). */
  readonly cacheHit: boolean;
  /** Wall-clock time of the model call in milliseconds (0 when cached). */
  readonly durationMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

/** A structured summary of a file, folder, module, or project. */
export interface Summary {
  readonly kind: SummaryKind;
  /** The path (or project label) being summarized. */
  readonly target: string;
  readonly content: SummaryContent;
  readonly metadata: SummaryMetadata;
}

/** Generates and caches structured summaries of code. */
export interface SummaryPort {
  summarizeFile(file: SourceFile, options?: SummaryOptions): Promise<Result<Summary>>;
  summarizeFolder(
    target: string,
    files: readonly SourceFile[],
    options?: SummaryOptions,
  ): Promise<Result<Summary>>;
  summarizeModule(
    target: string,
    files: readonly SourceFile[],
    options?: SummaryOptions,
  ): Promise<Result<Summary>>;
  summarizeProject(
    files: readonly SourceFile[],
    options?: SummaryOptions,
  ): Promise<Result<Summary>>;
}
