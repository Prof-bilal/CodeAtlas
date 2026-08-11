import type { FilePath } from "@atlas/shared";

/**
 * A single file discovered during a project scan. No file contents are read;
 * this is pure filesystem metadata.
 */
export interface ScannedFile {
  /** Absolute path to the file. */
  readonly path: FilePath;
  /** File name, e.g. `"index.ts"`. */
  readonly name: string;
  /** Lowercase extension without the dot, or `null` when there is none. */
  readonly extension: string | null;
  /** Size of the file in bytes. */
  readonly sizeBytes: number;
  /** Detected programming language, or `null` when unknown. */
  readonly language: string | null;
}

/** A node in the scanned file/directory tree. */
export interface FileTreeNode {
  readonly name: string;
  /** Absolute path to the node. */
  readonly path: FilePath;
  readonly type: "file" | "directory";
  /** Child nodes. Always present (empty for files). */
  readonly children: readonly FileTreeNode[];
}

/** A file type (grouped by extension) with its count and detected language. */
export interface DetectedFileType {
  /** Lowercase extension without the dot, or `null` for extensionless files. */
  readonly extension: string | null;
  readonly count: number;
  /** Detected language for this extension, or `null` when unknown. */
  readonly language: string | null;
}

/** A language detected in the project and how many files use it. */
export interface DetectedLanguage {
  readonly name: string;
  readonly fileCount: number;
  /** All extensions mapped to this language. */
  readonly extensions: readonly string[];
}

/**
 * The structured result of scanning a project directory.
 *
 * This is deliberately "metadata only" — no parsing, no AI, no persistence.
 */
export interface ProjectScan {
  /** Project name derived from the root directory name. */
  readonly name: string;
  /** Absolute root directory that was scanned. */
  readonly rootPath: FilePath;
  /** Number of non-ignored files found. */
  readonly totalFiles: number;
  /** Number of non-ignored folders found (excluding the root itself). */
  readonly totalFolders: number;
  /** Nested file/directory tree. */
  readonly tree: readonly FileTreeNode[];
  /** Flat list of every scanned file. */
  readonly files: readonly ScannedFile[];
  /** Files grouped by extension, most common first. */
  readonly fileTypes: readonly DetectedFileType[];
  /** Languages detected in the project, most common first. */
  readonly languages: readonly DetectedLanguage[];
  /** Detected framework (e.g. `"next.js"`, `"react"`), or `null`. */
  readonly framework: string | null;
  readonly hasPackageJson: boolean;
  readonly hasTsconfig: boolean;
  readonly hasReadme: boolean;
  readonly isGitRepository: boolean;
}
