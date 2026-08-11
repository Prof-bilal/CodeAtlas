import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Project-level instructions for a context package.
 *
 * The agent should follow the repository's own rules without re-reading the
 * whole tree, so the package includes the repo's instruction files
 * (`AGENTS.md`, `CLAUDE.md`), a README overview, and a `.codeatlas/manifest.json`
 * summary. Only a fixed allowlist of filenames is read (never `.env*`), and the
 * content is bounded (READMEs are capped).
 */

/** A project instruction file to include in a context package. */
export interface ProjectInstruction {
  /** Display name, e.g. `"AGENTS.md"` or `".codeatlas/manifest.json"`. */
  readonly filename: string;
  /** Absolute path on disk (for the deny-filter and exclusion record). */
  readonly path: string;
  readonly content: string;
}

/** Fixed allowlist of instruction files (never `.env*`, never arbitrary paths). */
const INSTRUCTION_FILES: readonly string[] = ["AGENTS.md", "CLAUDE.md"];

const README_NAMES: readonly string[] = ["README.md", "README.markdown"];

/** Upper bound for the README overview included in a package. */
const README_MAX_CHARS = 4000;

/** Collect the repository's instruction files plus a manifest summary. */
export function collectInstructions(repositoryPath: string): readonly ProjectInstruction[] {
  const instructions: ProjectInstruction[] = [];
  for (const name of INSTRUCTION_FILES) {
    const file = readTextFile(join(repositoryPath, name));
    if (file !== undefined) {
      instructions.push({ filename: name, path: file.path, content: file.content });
    }
  }
  for (const name of README_NAMES) {
    const file = readTextFile(join(repositoryPath, name));
    if (file !== undefined) {
      const content = file.content.slice(0, README_MAX_CHARS);
      instructions.push({ filename: name, path: file.path, content });
    }
  }
  const manifest = readManifestSummary(repositoryPath);
  if (manifest !== undefined) {
    instructions.push(manifest);
  }
  return instructions;
}

/** Read a file as UTF-8, or `undefined` when absent/unreadable. */
function readTextFile(
  path: string,
): { readonly path: string; readonly content: string } | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return { path, content: readFileSync(path, "utf8") };
  } catch {
    return undefined;
  }
}

/** A short human-readable summary of `.codeatlas/manifest.json`, when present. */
function readManifestSummary(repositoryPath: string): ProjectInstruction | undefined {
  const path = join(repositoryPath, ".codeatlas", "manifest.json");
  const file = readTextFile(path);
  if (file === undefined) {
    return undefined;
  }
  try {
    const manifest: unknown = JSON.parse(file.content);
    if (typeof manifest !== "object" || manifest === null) {
      return undefined;
    }
    const record = manifest as Record<string, unknown>;
    const lines: string[] = [];
    if (typeof record["name"] === "string") {
      lines.push(`Project: ${record["name"]}`);
    }
    if (typeof record["framework"] === "string") {
      lines.push(`Framework: ${record["framework"]}`);
    }
    if (Array.isArray(record["languages"])) {
      const languages = record["languages"].filter(
        (item): item is string => typeof item === "string",
      );
      if (languages.length > 0) {
        lines.push(`Languages: ${languages.join(", ")}`);
      }
    }
    if (typeof record["packageManager"] === "string") {
      lines.push(`Package manager: ${record["packageManager"]}`);
    }
    if (lines.length === 0) {
      return undefined;
    }
    return { filename: ".codeatlas/manifest.json", path, content: lines.join("\n") };
  } catch {
    return undefined;
  }
}
