import type { Reference, Symbol } from "@atlas/core";
import type { FilePath } from "@atlas/shared";

/**
 * The parser's normalized output for a single source file.
 *
 * This is deliberately independent of any concrete language — symbols carry a
 * normalized kind, location, parent, and visibility, so downstream consumers
 * (graph, storage, context) never need to know the source language.
 */
export interface ParsedFile {
  readonly path: FilePath;
  /** Detected language, e.g. `"typescript"`. */
  readonly language: string;
  /** Symbols in declaration order, linked to parents via `parentId`. */
  readonly symbols: readonly Symbol[];
  /**
   * Identifier usages in the file that resolved to a same-file target.
   *
   * Usages that resolve to no symbol in the file are dropped so a large corpus
   * stays memory-bounded: unresolved usages were never consumed by the
   * dependency graph (which only emits edges for resolved targets) and were
   * never persisted, yet retaining every identifier usage was the dominant
   * peak-memory cost at repository scale.
   */
  readonly references: readonly Reference[];
}

/** A file the parser did not process, and why. */
export interface SkippedFile {
  readonly path: FilePath;
  readonly reason: string;
}

/**
 * The result of parsing a batch of (changed) files. Files that have no
 * registered parser or that fail to parse are reported in {@link SkippedFile
 * skipped} instead of failing the whole batch.
 */
export interface ParseBatch {
  readonly parsed: readonly ParsedFile[];
  readonly skipped: readonly SkippedFile[];
}
