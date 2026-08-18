// biome-ignore lint/suspicious/noShadowRestrictedNames: domain Symbol type, not the JS global
import type { Reference, Symbol } from "@atlas/core";
import { SymbolIndexer, TypeScriptParser } from "@atlas/parser";
import type { ParsedFile } from "@atlas/parser";
import type { FilePath } from "@atlas/shared";

/** Parsed + indexed input for building a graph. */
export interface GraphFixture {
  readonly symbols: readonly Symbol[];
  readonly references: readonly Reference[];
  readonly indexer: SymbolIndexer;
}

/** Parse one TypeScript file, throwing on failure. */
export async function parseTs(content: string, path: string): Promise<ParsedFile> {
  const result = await new TypeScriptParser().parse({
    path: path as FilePath,
    language: "typescript",
    content,
  });
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

/** Parse and index a set of `[path, content]` files for graph building. */
export async function indexFixture(
  files: ReadonlyArray<readonly [string, string]>,
): Promise<GraphFixture> {
  const parsed: ParsedFile[] = [];
  for (const [path, content] of files) {
    parsed.push(await parseTs(content, path));
  }
  const indexer = new SymbolIndexer().index(parsed);
  return { symbols: indexer.listSymbols(), references: indexer.references(), indexer };
}
